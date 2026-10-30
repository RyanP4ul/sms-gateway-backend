import { and, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { status } from 'elysia';
import { db, devices, smsRequests } from '@/db';
import { parseCsv } from '@/lib/csv';
import { generateBatchId } from '@/lib/crypto';
import { env } from '@/lib/env';
import { pageMeta, paginate } from '@/lib/pagination';
import { toIso } from '@/lib/time';
import type { RequestMeta } from '@/lib/request';
import {
  applyTemplate, maskPhone, parsePhoneNumbers, validateDeviceId, validateMessage, validatePhoneNumber,
  validatePriority, validateSmsRequest, validateUrl,
} from '@/lib/validation';
import { Audit } from '../audit/service';
import { Blacklist } from '../blacklist/service';
import { Templates } from '../templates/service';
import { Webhooks } from '../webhooks/service';
import type { SmsModel } from './model';

type NewSms = typeof smsRequests.$inferInsert;
const CHUNK = 1000; // keeps each INSERT well below Postgres' 65 535 bind-parameter limit
const DEVICE_STATUSES = ['sent', 'delivered', 'failed'] as const;

export abstract class Sms {
  // ───────────────────────────── Admin: enqueue ─────────────────────────────

  static async send(body: SmsModel['sendBody'], meta: RequestMeta) {
    const deviceId = validateDeviceId(body.device_id);
    const phone = validatePhoneNumber(body.phone_number);

    // A template (if given) supplies the text; otherwise the plain message is required.
    let message: string | null = null;
    if (body.template_id !== undefined) message = await Templates.resolve(body.template_id, body.variables ?? {});
    message ??= validateMessage(body.message);

    const errors = validateSmsRequest({ device_id: deviceId, phone_number: phone, message });
    if (errors.length) return status(400, { error: 'Validation error', details: errors });

    let scheduledAt: Date | null = null;
    if (body.scheduled_at) {
      scheduledAt = new Date(body.scheduled_at);
      if (Number.isNaN(scheduledAt.getTime())) return status(400, { error: 'Invalid scheduled_at' });
    }

    if (await Blacklist.isBlacklisted(phone!)) return status(403, { error: 'This number is blacklisted' });
    const bad = await Sms.checkDevice(deviceId!);
    if (bad) return bad;

    const [row] = await db
      .insert(smsRequests)
      .values({
        device_id: deviceId!,
        phone_number: phone!,
        message: message!,
        priority: validatePriority(body.priority ?? 5),
        sim_slot: Math.max(0, Math.min(2, Math.trunc(body.sim_slot ?? 0))),
        scheduled_at: scheduledAt,
        webhook_url: body.webhook_url ? validateUrl(body.webhook_url) : null,
        max_retries: env.SMS_RETRY_MAX,
      })
      .returning({ id: smsRequests.id });

    await Audit.log({ action: 'sms.created', actorType: 'admin', details: { request_id: row!.id, device_id: deviceId, phone: maskPhone(phone!) }, meta });
    return status(201, { success: true, message: 'SMS queued', request_id: row!.id });
  }

  static async bulk({ device_id, messages }: SmsModel['bulkBody'], meta: RequestMeta) {
    const deviceId = validateDeviceId(device_id);
    if (deviceId === null) return status(400, { error: 'A valid device_id is required' });
    if (messages.length === 0) return status(400, { error: 'messages array is required' });
    if (messages.length > env.MAX_BULK_SIZE) return status(400, { error: `At most ${env.MAX_BULK_SIZE} SMS can be sent in one batch` });

    const bad = await Sms.checkDevice(deviceId, 404);
    if (bad) return bad;

    const candidates = messages.map((m) => ({
      phone: validatePhoneNumber(m.phone_number),
      text: validateMessage(m.message),
      priority: validatePriority(m.priority ?? 5),
    }));
    const blacklisted = await Blacklist.filter(candidates.flatMap((c) => (c.phone ? [c.phone] : [])));

    const batchId = generateBatchId();
    const rows: NewSms[] = [];
    let skipped = 0;
    for (const c of candidates) {
      if (!c.phone || !c.text || blacklisted.has(c.phone)) skipped++;
      else rows.push({ device_id: deviceId, phone_number: c.phone, message: c.text, priority: c.priority, batch_id: batchId, max_retries: env.SMS_RETRY_MAX });
    }

    const ids = await db.transaction(async (tx) => {
      const out: number[] = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const inserted = await tx.insert(smsRequests).values(rows.slice(i, i + CHUNK)).returning({ id: smsRequests.id });
        out.push(...inserted.map((r) => r.id));
      }
      return out;
    });

    await Audit.log({ action: 'sms.bulk_created', actorType: 'admin', details: { batch_id: batchId, inserted: ids.length, skipped }, meta });
    return status(201, { success: true, batch_id: batchId, inserted: ids.length, skipped, ids });
  }

  // ───────────────────────────── Admin: read ─────────────────────────────

  static async getById(id: number) {
    if (!(id > 0)) return status(400, { error: 'A valid id parameter is required' });
    const [sms] = await db
      .select({
        id: smsRequests.id, device_id: smsRequests.device_id, phone_number: smsRequests.phone_number, message: smsRequests.message,
        status: smsRequests.status, priority: smsRequests.priority, scheduled_at: smsRequests.scheduled_at, sent_at: smsRequests.sent_at,
        delivered_at: smsRequests.delivered_at, error_message: smsRequests.error_message, retry_count: smsRequests.retry_count,
        batch_id: smsRequests.batch_id, created_at: smsRequests.created_at,
      })
      .from(smsRequests)
      .where(eq(smsRequests.id, id))
      .limit(1);
    if (!sms) return status(404, { error: 'SMS not found' });
    return { success: true, sms };
  }

  static async history(query: SmsModel['historyQuery']) {
    const { page, limit, offset } = paginate(query);
    const conditions: SQL[] = [];
    if (query.device_id) conditions.push(eq(smsRequests.device_id, query.device_id));
    if (query.status) conditions.push(eq(smsRequests.status, query.status));
    if (query.batch_id?.trim()) conditions.push(eq(smsRequests.batch_id, query.batch_id.trim()));
    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total = 0 } = {}] = await db.select({ total: count() }).from(smsRequests).where(where);
    const messages = await db
      .select({
        id: smsRequests.id, device_id: smsRequests.device_id, phone_number: smsRequests.phone_number, status: smsRequests.status,
        priority: smsRequests.priority, batch_id: smsRequests.batch_id, sent_at: smsRequests.sent_at, created_at: smsRequests.created_at,
      })
      .from(smsRequests)
      .where(where)
      .orderBy(desc(smsRequests.created_at))
      .limit(limit)
      .offset(offset);
    return { success: true, ...pageMeta(total, page, limit), messages };
  }

  // ───────────────────────────── Distribution ─────────────────────────────

  /** Round-robin: number i goes to device i mod n. */
  static async distribute(body: SmsModel['distributeBody'], meta: RequestMeta) {
    const plan = await Sms.prepareBatch(body, 'None of the selected devices are active');
    if (!('clean' in plan)) return plan;

    const order = [...new Set(body.device_ids)].filter((id) => plan.devices.some((d) => d.device_id === id));
    const assignments = plan.clean.map((phone, i) => ({ phone, device: order[i % order.length]! }));
    const { batchId, distribution } = await Sms.insertAssignments(assignments, plan);

    await Audit.log({
      action: 'sms.distributed', actorType: 'admin', meta,
      details: { batch_id: batchId, total: assignments.length, blacklisted: plan.blacklisted, devices: distribution },
    });
    return status(201, {
      success: true, batch_id: batchId, total_numbers: plan.phones.length, inserted: assignments.length,
      blacklisted: plan.blacklisted, device_count: order.length, distribution,
    });
  }

  /** Proportional split by `weight`, `performance_score`, or inverse cost. */
  static async distributeWeighted(body: SmsModel['distributeWeightedBody'], meta: RequestMeta) {
    const plan = await Sms.prepareBatch(body, 'No active devices found');
    if (!('clean' in plan)) return plan;

    const strategy = body.strategy ?? 'weighted';
    const weights = new Map<string, number>();
    for (const d of plan.devices) {
      weights.set(
        d.device_id,
        strategy === 'performance' ? Math.max(1, d.performance_score)
        : strategy === 'cost' ? Math.max(1, Math.trunc(100 - d.cost_per_sms * 100))
        : Math.max(1, d.weight),
      );
    }
    const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);

    // Share per device; any rounding remainder goes to the first device.
    const shares = new Map<string, number>();
    let remaining = plan.clean.length;
    for (const [id, w] of weights) {
      const share = Math.min(Math.round((plan.clean.length * w) / totalWeight), remaining);
      shares.set(id, share);
      remaining -= share;
    }
    if (remaining > 0) {
      const first = shares.keys().next().value as string;
      shares.set(first, (shares.get(first) ?? 0) + remaining);
    }

    const assignments: { phone: string; device: string }[] = [];
    let idx = 0;
    for (const [device, n] of shares) for (let i = 0; i < n && idx < plan.clean.length; i++, idx++) assignments.push({ phone: plan.clean[idx]!, device });

    const { batchId, distribution } = await Sms.insertAssignments(assignments, plan, shares.keys());
    await Audit.log({
      action: 'sms.distributed_weighted', actorType: 'admin', meta,
      details: { batch_id: batchId, strategy, total: assignments.length, blacklisted: plan.blacklisted, weights: Object.fromEntries(weights) },
    });
    return status(201, {
      success: true, batch_id: batchId, strategy, inserted: assignments.length, blacklisted: plan.blacklisted,
      distribution, weights: Object.fromEntries(weights),
    });
  }

  static async importCsv(body: SmsModel['importCsvBody'], meta: RequestMeta) {
    const deviceId = validateDeviceId(body.device_id);
    if (deviceId === null) return status(400, { error: 'device_id is required' });
    const plain = body.message !== undefined ? validateMessage(body.message) : null;
    if (plain === null && body.template_id === undefined) return status(400, { error: 'message veya template_id gerekli' });

    const rows = parseCsv(body.csv_data);
    if (rows.length === 0) return status(400, { error: 'CSV data is empty' });
    const headers = rows.shift()!.map((h) => h.trim().toLowerCase());
    const phoneIdx = ['phone', 'phone_number', 'telefon'].map((h) => headers.indexOf(h)).find((i) => i >= 0) ?? -1;
    if (phoneIdx < 0) return status(400, { error: "Could not find a phone, phone_number, or telefon column in the CSV" });

    let text = plain;
    if (body.template_id !== undefined) {
      text = await Templates.resolve(body.template_id);
      if (text === null) return status(404, { error: 'Template not found' });
    }

    const bad = await Sms.checkDevice(deviceId, 404);
    if (bad) return bad;

    const parsed = rows.map((cols) => ({ phone: validatePhoneNumber((cols[phoneIdx] ?? '').trim()), cols }));
    const blacklisted = await Blacklist.filter(parsed.flatMap((p) => (p.phone ? [p.phone] : [])));
    const priority = validatePriority(body.priority ?? 5);
    const batchId = generateBatchId();

    const inserts: NewSms[] = [];
    let skipped = 0;
    for (const { phone, cols } of parsed) {
      if (!phone || blacklisted.has(phone)) { skipped++; continue; }
      const variables = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']));
      const message = validateMessage(applyTemplate(text!, variables));
      if (message === null) { skipped++; continue; }
      inserts.push({ device_id: deviceId, phone_number: phone, message, priority, batch_id: batchId, max_retries: env.SMS_RETRY_MAX });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < inserts.length; i += CHUNK) await tx.insert(smsRequests).values(inserts.slice(i, i + CHUNK));
    });

    await Audit.log({ action: 'sms.csv_imported', actorType: 'admin', details: { batch_id: batchId, inserted: inserts.length, skipped }, meta });
    return status(201, { success: true, batch_id: batchId, inserted: inserts.length, skipped });
  }

  // ───────────────────────────── Device (gateway) side ─────────────────────────────

  /**
   * Hand the device its next messages. Claiming happens in one statement with
   * `FOR UPDATE SKIP LOCKED`, so two polls can never receive the same message
   * (the PHP version did SELECT then UPDATE, which could double-send).
   */
  static async pending(deviceId: string) {
    await db.update(devices).set({ last_seen: sql`now()` }).where(eq(devices.device_id, deviceId));

    // Failed messages whose back-off has elapsed go back to the queue.
    await db
      .update(smsRequests)
      .set({ status: 'pending' })
      .where(
        and(
          eq(smsRequests.device_id, deviceId),
          eq(smsRequests.status, 'failed'),
          sql`${smsRequests.retry_count} < ${smsRequests.max_retries}`,
          sql`${smsRequests.next_retry_at} is not null and ${smsRequests.next_retry_at} <= now()`,
        ),
      );

    const claimed = await db.execute<{
      id: number; phone_number: string; message: string; priority: number; scheduled_at: string | null; sim_slot: number; retry_count: number;
    }>(sql`
      update sms_requests set status = 'processing', updated_at = now()
      where id in (
        select id from sms_requests
        where device_id = ${deviceId} and status = 'pending' and (scheduled_at is null or scheduled_at <= now())
        order by priority desc, created_at asc
        limit 10
        for update skip locked
      )
      returning id, phone_number, message, priority, scheduled_at, sim_slot, retry_count`);

    const messages = [...claimed]
      .sort((a, b) => b.priority - a.priority || a.id - b.id)
      .map((m) => ({ ...m, scheduled_at: toIso(m.scheduled_at) }));
    return { success: true, count: messages.length, messages };
  }

  static async updateStatus(deviceId: string, body: SmsModel['updateStatusBody'], meta: RequestMeta) {
    const requestId = Math.trunc(body.request_id);
    const newStatus = DEVICE_STATUSES.find((s) => s === body.status);
    const errorMessage = body.error_message ? [...body.error_message].slice(0, 1000).join('') : null;

    if (!(requestId > 0)) return status(400, { error: 'A valid request_id is required' });
    if (!newStatus) return status(400, { error: 'A valid status is required (sent, delivered, failed)' });

    const updated = await db
      .update(smsRequests)
      .set({
        status: newStatus,
        ...(newStatus === 'sent' ? { sent_at: sql`now()` } : {}),
        ...(newStatus === 'delivered' ? { delivered_at: sql`now()` } : {}),
        ...(newStatus === 'failed'
          ? {
              retry_count: sql`${smsRequests.retry_count} + 1`,
              // Exponential back-off: 2^(new retry count) × 30 s (MySQL evaluated the already-incremented value).
              next_retry_at: sql`now() + make_interval(secs => power(2, ${smsRequests.retry_count} + 1) * 30)`,
            }
          : {}),
        ...(errorMessage !== null ? { error_message: errorMessage } : {}),
      })
      .where(and(eq(smsRequests.id, requestId), eq(smsRequests.device_id, deviceId)))
      .returning({ id: smsRequests.id });
    if (updated.length === 0) return status(404, { error: 'SMS request not found' });

    Webhooks.trigger(`sms.${newStatus}`, { request_id: requestId, device_id: deviceId, status: newStatus, error_message: errorMessage });
    await Audit.log({ action: 'sms.status_updated', actorType: 'device', actorId: deviceId, details: { request_id: requestId, status: newStatus }, meta });
    return { success: true, message: 'Status updated' };
  }

  /** SMS typed by hand on the phone and mirrored to the gateway. */
  static async manual(deviceId: string, body: SmsModel['manualBody'], meta: RequestMeta) {
    const phone = validatePhoneNumber(body.phone_number);
    const message = validateMessage(body.message);
    if (phone === null) return status(400, { error: 'A valid phone number is required' });
    if (message === null) return status(400, { error: 'Message cannot be empty' });
    if (await Blacklist.isBlacklisted(phone)) return status(403, { error: 'This number is blacklisted' });

    const [row] = await db
      .insert(smsRequests)
      .values({ device_id: deviceId, phone_number: phone, message, priority: 5, max_retries: env.SMS_RETRY_MAX })
      .returning({ id: smsRequests.id });
    await Audit.log({ action: 'sms.manual_created', actorType: 'device', actorId: deviceId, details: { request_id: row!.id, phone: maskPhone(phone) }, meta });
    return status(201, { success: true, request_id: row!.id, message: 'SMS queued' });
  }

  // ───────────────────────────── Internals ─────────────────────────────

  private static async checkDevice(deviceId: string, notFoundCode: 404 = 404) {
    const [d] = await db.select({ is_active: devices.is_active, deleted_at: devices.deleted_at }).from(devices).where(eq(devices.device_id, deviceId)).limit(1);
    if (!d) return status(notFoundCode, { error: 'Device not found' });
    if (d.deleted_at !== null) return status(410, { error: 'Device deleted' });
    if (!d.is_active) return status(403, { error: 'Device is inactive' });
    return null;
  }

  /** Shared validation for both distribution strategies. */
  private static async prepareBatch(
    body: { device_ids: string[]; phone_numbers: unknown; message?: string; template_id?: number; variables?: Record<string, unknown>; priority?: number },
    noDeviceMessage: string,
  ) {
    const phones = parsePhoneNumbers(body.phone_numbers);
    if (phones.length === 0) return status(400, { error: 'At least one valid phone number is required' });

    let message: string | null;
    if (body.template_id !== undefined) {
      message = await Templates.resolve(body.template_id, body.variables ?? {});
      if (message === null) return status(404, { error: 'Template not found or inactive' });
    } else message = validateMessage(body.message);
    if (message === null) return status(400, { error: 'Message or a valid template_id is required' });

    const active = await db
      .select({ device_id: devices.device_id, weight: devices.weight, performance_score: devices.performance_score, cost_per_sms: devices.cost_per_sms })
      .from(devices)
      .where(and(inArray(devices.device_id, body.device_ids), eq(devices.is_active, true), isNull(devices.deleted_at)));
    if (active.length === 0) return status(400, { error: noDeviceMessage });

    const blacklisted = await Blacklist.filter(phones);
    const clean = phones.filter((p) => !blacklisted.has(p));
    if (clean.length === 0) return status(400, { error: 'All numbers are blacklisted' });

    return { phones, clean, blacklisted: blacklisted.size, message, priority: validatePriority(body.priority ?? 5), devices: active };
  }

  private static async insertAssignments(
    assignments: { phone: string; device: string }[],
    plan: { message: string; priority: number },
    deviceOrder: Iterable<string> = [],
  ) {
    const batchId = generateBatchId();
    const distribution: Record<string, number> = Object.fromEntries([...deviceOrder].map((d) => [d, 0]));
    for (const a of assignments) distribution[a.device] = (distribution[a.device] ?? 0) + 1;

    await db.transaction(async (tx) => {
      for (let i = 0; i < assignments.length; i += CHUNK) {
        await tx.insert(smsRequests).values(
          assignments.slice(i, i + CHUNK).map((a) => ({
            device_id: a.device, phone_number: a.phone, message: plan.message, priority: plan.priority,
            batch_id: batchId, max_retries: env.SMS_RETRY_MAX,
          })),
        );
      }
    });
    return { batchId, distribution };
  }
}

