import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { status } from 'elysia';
import { autoReplyRules, db, incomingSms, smsRequests } from '@/db';
import { env } from '@/lib/env';
import { pageMeta, paginate } from '@/lib/pagination';
import { maskPhone, validatePhoneNumber } from '@/lib/validation';
import { AutoReply } from '../auto-reply/service';
import { Blacklist } from '../blacklist/service';
import { Webhooks } from '../webhooks/service';
import type { IncomingModel } from './model';

export abstract class Incoming {
  /** Device reports a received SMS; an auto-reply is queued if a rule matches. */
  static async report(deviceId: string, body: IncomingModel['reportBody']) {
    const sender = validatePhoneNumber(body.sender_number);
    const message = body.message.trim();
    if (sender === null) return status(400, { error: 'Geçerli bir sender_number gerekli' });
    if (message === '') return status(400, { error: 'Mesaj boş olamaz' });

    const rule = await AutoReply.findMatch(message);
    const shouldReply = rule !== null && !(await Blacklist.isBlacklisted(sender));

    const incomingId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(incomingSms)
        .values({ device_id: deviceId, sender_number: sender, message: [...message].slice(0, 5000).join('') })
        .returning({ id: incomingSms.id });

      if (shouldReply) {
        await tx.insert(smsRequests).values({ device_id: deviceId, phone_number: sender, message: rule.reply_message, priority: 8, max_retries: env.SMS_RETRY_MAX });
        await tx.update(incomingSms).set({ auto_reply_sent: true }).where(eq(incomingSms.id, row!.id));
        await tx.update(autoReplyRules).set({ usage_count: sql`${autoReplyRules.usage_count} + 1` }).where(eq(autoReplyRules.id, rule.id));
      }
      return row!.id;
    });

    Webhooks.trigger('sms.incoming', {
      device_id: deviceId,
      sender_number: maskPhone(sender),
      message_length: [...message].length,
      auto_replied: shouldReply,
    });
    return status(201, { success: true, incoming_id: incomingId, auto_replied: shouldReply, reply_message: shouldReply ? rule.reply_message : null });
  }

  static async list(query: IncomingModel['listQuery']) {
    const { page, limit, offset } = paginate(query);
    const conditions: SQL[] = [];
    if (query.device_id) conditions.push(eq(incomingSms.device_id, query.device_id));
    if (query.is_read) conditions.push(eq(incomingSms.is_read, query.is_read === '1'));
    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total = 0 } = {}] = await db.select({ total: count() }).from(incomingSms).where(where);
    const messages = await db
      .select({
        id: incomingSms.id, device_id: incomingSms.device_id, sender_number: incomingSms.sender_number, message: incomingSms.message,
        received_at: incomingSms.received_at, is_read: incomingSms.is_read, auto_reply_sent: incomingSms.auto_reply_sent, created_at: incomingSms.created_at,
      })
      .from(incomingSms)
      .where(where)
      .orderBy(desc(incomingSms.received_at))
      .limit(limit)
      .offset(offset);
    return { success: true, ...pageMeta(total, page, limit), messages };
  }

  /** New in v4: the original schema had `is_read` but nothing ever set it. */
  static async markRead({ ids }: IncomingModel['markReadBody']) {
    const updated = await db.update(incomingSms).set({ is_read: true }).where(inArray(incomingSms.id, ids)).returning({ id: incomingSms.id });
    return { success: true, updated: updated.length };
  }
}
