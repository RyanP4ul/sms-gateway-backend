import { and, desc, eq, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { db, webhooks } from '@/db';
import { hmacSha256, randomHex } from '@/lib/crypto';
import { validateUrl } from '@/lib/validation';
import { WEBHOOK_EVENTS, type WebhooksModel } from './model';

export abstract class Webhooks {
  static async create({ url, events }: WebhooksModel['createBody']) {
    const validUrl = validateUrl(url);
    if (validUrl === null) return status(400, { error: 'Geçerli bir URL gerekli' });

    const validEvents = events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (validEvents.length === 0)
      return status(400, { error: `Geçerli event türleri: ${WEBHOOK_EVENTS.join(', ')}` });

    const secret = randomHex(16);
    const [row] = await db.insert(webhooks).values({ url: validUrl, events: [...new Set(validEvents)], secret }).returning({ id: webhooks.id });
    return status(201, { success: true, webhook_id: row!.id, secret, message: 'Webhook oluşturuldu' });
  }

  static async list() {
    const rows = await db
      .select({
        id: webhooks.id, url: webhooks.url, events: webhooks.events, is_active: webhooks.is_active,
        last_triggered_at: webhooks.last_triggered_at, failure_count: webhooks.failure_count, created_at: webhooks.created_at,
      })
      .from(webhooks)
      .orderBy(desc(webhooks.created_at));
    return { success: true, webhooks: rows };
  }

  /**
   * Fire-and-forget delivery. Unlike the PHP version (which blocked the request for up to 5 s per
   * hook) this never delays the caller; failures are counted on the webhook row.
   */
  static trigger(event: string, payload: Record<string, unknown>): void {
    void Webhooks.deliver(event, payload);
  }

  private static async deliver(event: string, payload: Record<string, unknown>) {
    try {
      const hooks = await db
        .select({ id: webhooks.id, url: webhooks.url, secret: webhooks.secret })
        .from(webhooks)
        .where(and(eq(webhooks.is_active, true), sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`));

      await Promise.allSettled(
        hooks.map(async (hook) => {
          const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
          let ok = false;
          try {
            const res = await fetch(hook.url, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-webhook-signature': hook.secret ? hmacSha256(body, hook.secret) : '',
              },
              body,
              redirect: 'manual',
              signal: AbortSignal.timeout(5000),
            });
            ok = res.ok;
          } catch {
            ok = false;
          }
          await db
            .update(webhooks)
            .set({
              last_triggered_at: sql`now()`,
              ...(ok ? {} : { failure_count: sql`${webhooks.failure_count} + 1` }),
            })
            .where(eq(webhooks.id, hook.id));
        }),
      );
    } catch (error) {
      console.error('Webhook error:', error);
    }
  }
}
