import { desc, eq, isNull, and, sql } from 'drizzle-orm';
import { db, devices, hourlyStats, smsRequests, uptimeChecks } from '@/db';
import { env } from '@/lib/env';
import { sseResponse } from '@/lib/sse';
import { agoDays, agoHours, agoMinutes, countWhere } from '@/lib/sql';
import type { StatsModel } from './model';

const s = smsRequests;
const startOfToday = sql`date_trunc('day', now())`;

export abstract class Stats {
  /** Dashboard overview: totals, today, 7-day trend, per-device breakdown. */
  static async overview() {
    const [overall] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        pending: countWhere(sql`${s.status} = 'pending'`),
        processing: countWhere(sql`${s.status} = 'processing'`),
        sent: countWhere(sql`${s.status} = 'sent'`),
        delivered: countWhere(sql`${s.status} = 'delivered'`),
        failed: countWhere(sql`${s.status} = 'failed'`),
        cancelled: countWhere(sql`${s.status} = 'cancelled'`),
      })
      .from(s);

    const [today] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        sent: countWhere(sql`${s.status} = 'sent'`),
        failed: countWhere(sql`${s.status} = 'failed'`),
      })
      .from(s)
      .where(sql`${s.created_at} >= ${startOfToday}`);

    const weekly_trend = await db
      .select({
        date: sql<string>`${s.created_at}::date`,
        total: sql<number>`count(*)`.mapWith(Number),
        sent: countWhere(sql`${s.status} = 'sent'`),
        failed: countWhere(sql`${s.status} = 'failed'`),
      })
      .from(s)
      .where(sql`${s.created_at} >= ${startOfToday} - interval '7 days'`)
      .groupBy(sql`${s.created_at}::date`)
      .orderBy(sql`${s.created_at}::date`);

    const per_device = await db
      .select({
        device_id: devices.device_id,
        device_name: devices.device_name,
        is_active: devices.is_active,
        last_seen: devices.last_seen,
        total_sms: sql<number>`count(${s.id})`.mapWith(Number),
        sent: countWhere(sql`${s.status} = 'sent'`),
        failed: countWhere(sql`${s.status} = 'failed'`),
      })
      .from(devices)
      .leftJoin(s, eq(devices.device_id, s.device_id))
      .where(isNull(devices.deleted_at))
      .groupBy(devices.device_id, devices.device_name, devices.is_active, devices.last_seen)
      .orderBy(desc(sql`count(${s.id})`));

    const [{ active = 0 } = {}] = await db
      .select({ active: sql<number>`count(*)`.mapWith(Number) })
      .from(devices)
      .where(and(isNull(devices.deleted_at), eq(devices.is_active, true)));

    return { success: true, overall, today, weekly_trend, per_device, active_devices: active };
  }

  static async heatmap({ days: rawDays }: StatsModel['heatmapQuery']) {
    const days = Math.max(1, Math.min(30, Math.trunc(rawDays ?? 7)));
    const hourly_stats = await db
      .select({
        stat_date: hourlyStats.stat_date, stat_hour: hourlyStats.stat_hour, device_id: hourlyStats.device_id,
        sent_count: hourlyStats.sent_count, failed_count: hourlyStats.failed_count,
      })
      .from(hourlyStats)
      .where(sql`${hourlyStats.stat_date} >= current_date - ${days}::int`)
      .orderBy(hourlyStats.stat_date, hourlyStats.stat_hour);

    // Live fallback for hours the cron hasn't aggregated yet.
    const realtime_data = await db
      .select({
        stat_date: sql<string>`${s.created_at}::date`,
        stat_hour: sql<number>`extract(hour from ${s.created_at})::int`,
        sent_count: countWhere(sql`${s.status} = 'sent'`),
        failed_count: countWhere(sql`${s.status} = 'failed'`),
      })
      .from(s)
      .where(sql`${s.created_at} >= ${agoDays(days)}`)
      .groupBy(sql`${s.created_at}::date`, sql`extract(hour from ${s.created_at})`)
      .orderBy(sql`${s.created_at}::date`, sql`extract(hour from ${s.created_at})`);

    return { success: true, period_days: days, hourly_stats, realtime_data };
  }

  static async uptime() {
    const u = uptimeChecks;
    const checks = await db
      .select({ check_type: u.check_type, target_id: u.target_id, is_up: u.is_up, response_time_ms: u.response_time_ms, error_message: u.error_message, created_at: u.created_at })
      .from(u)
      .where(sql`${u.created_at} >= ${agoHours(24)}`)
      .orderBy(desc(u.created_at))
      .limit(500);

    const device_uptime = await db
      .select({
        target_id: u.target_id,
        total_checks: sql<number>`count(*)`.mapWith(Number),
        up_count: countWhere(sql`${u.is_up}`),
        uptime_pct: sql<number>`round(count(*) filter (where ${u.is_up}) * 100.0 / count(*), 2)`.mapWith(Number),
        avg_response_ms: sql<number | null>`round(avg(${u.response_time_ms}))`.mapWith((v) => (v === null ? null : Number(v))),
      })
      .from(u)
      .where(sql`${u.check_type} = 'device' and ${u.created_at} >= ${agoHours(24)}`)
      .groupBy(u.target_id);

    const [api] = await db
      .select({
        uptime_pct: sql<number | null>`round(count(*) filter (where ${u.is_up}) * 100.0 / nullif(count(*), 0), 2)`.mapWith((v) => (v === null ? null : Number(v))),
        avg_response_ms: sql<number | null>`round(avg(${u.response_time_ms}))`.mapWith((v) => (v === null ? null : Number(v))),
      })
      .from(u)
      .where(sql`${u.check_type} = 'api' and ${u.created_at} >= ${agoHours(24)}`);

    return {
      success: true,
      checks,
      device_uptime,
      api_uptime: { uptime_pct: api?.uptime_pct ?? 100, avg_response_ms: api?.avg_response_ms ?? 0 },
    };
  }

  static async queue() {
    const rows = await db.select({ status: s.status, count: sql<number>`count(*)`.mapWith(Number) }).from(s).groupBy(s.status);
    const status_counts = Object.fromEntries(rows.map((r) => [r.status, r.count]));

    const throughput = await db
      .select({
        minute: sql<string>`to_char(${s.created_at}, 'HH24:MI')`,
        total: sql<number>`count(*)`.mapWith(Number),
        sent: countWhere(sql`${s.status} = 'sent'`),
        failed: countWhere(sql`${s.status} = 'failed'`),
        pending: countWhere(sql`${s.status} = 'pending'`),
      })
      .from(s)
      .where(sql`${s.created_at} >= ${agoHours(1)}`)
      .groupBy(sql`to_char(${s.created_at}, 'YYYY-MM-DD HH24:MI')`, sql`to_char(${s.created_at}, 'HH24:MI')`)
      .orderBy(sql`to_char(${s.created_at}, 'YYYY-MM-DD HH24:MI')`);

    const device_queues = await db
      .select({
        device_id: s.device_id,
        device_name: devices.device_name,
        pending: countWhere(sql`${s.status} = 'pending'`),
        processing: countWhere(sql`${s.status} = 'processing'`),
        sent: countWhere(sql`${s.status} = 'sent'`),
        failed: countWhere(sql`${s.status} = 'failed'`),
      })
      .from(s)
      .leftJoin(devices, eq(s.device_id, devices.device_id))
      .where(sql`${s.created_at} >= ${agoHours(24)}`)
      .groupBy(s.device_id, devices.device_name);

    const [avg] = await db
      .select({ v: sql<number | null>`avg(extract(epoch from (${s.sent_at} - ${s.created_at})))`.mapWith((x) => (x === null ? null : Number(x))) })
      .from(s)
      .where(sql`${s.status} = 'sent' and ${s.sent_at} is not null and ${s.created_at} >= ${agoHours(1)}`);

    const queue_trend = await db
      .select({
        hour: sql<string>`to_char(${s.created_at}, 'YYYY-MM-DD HH24:00')`,
        pending_at_hour: countWhere(sql`${s.status} = 'pending'`),
        total_at_hour: sql<number>`count(*)`.mapWith(Number),
      })
      .from(s)
      .where(sql`${s.created_at} >= ${agoHours(24)}`)
      .groupBy(sql`to_char(${s.created_at}, 'YYYY-MM-DD HH24:00')`)
      .orderBy(sql`to_char(${s.created_at}, 'YYYY-MM-DD HH24:00')`);

    return { success: true, status_counts, throughput, device_queues, avg_process_seconds: Math.round((avg?.v ?? 0) * 10) / 10, queue_trend };
  }

  /** Dashboard stream: today's counters, devices online, last 5 touched messages (every 5 s, up to 5 min). */
  static dashboardStream(signal: AbortSignal) {
    return sseResponse(signal, { intervalMs: 5000, maxMs: 300_000, closeData: 'stream_ended' }, async () => {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
          pending: countWhere(sql`${s.status} = 'pending'`),
          sent: countWhere(sql`${s.status} = 'sent'`),
          failed: countWhere(sql`${s.status} = 'failed'`),
        })
        .from(s)
        .where(sql`${s.created_at} >= ${startOfToday}`);
      const [{ online = 0 } = {}] = await db
        .select({ online: sql<number>`count(*)`.mapWith(Number) })
        .from(devices)
        .where(and(isNull(devices.deleted_at), eq(devices.is_active, true), sql`${devices.last_seen} >= now() - make_interval(secs => ${env.DEVICE_OFFLINE_THRESHOLD}::double precision)`));
      const recent = await db
        .select({ id: s.id, device_id: s.device_id, phone_number: s.phone_number, status: s.status, created_at: s.created_at })
        .from(s)
        .orderBy(desc(s.updated_at))
        .limit(5);
      return { stats, online_devices: online, recent, timestamp: new Date().toISOString() };
    });
  }

  /** Queue stream: 24 h status counts + last 5 messages (every 3 s, up to 3 min). */
  static queueStream(signal: AbortSignal) {
    return sseResponse(signal, { intervalMs: 3000, maxMs: 180_000, closeData: 'done' }, async () => {
      const rows = await db
        .select({ status: s.status, count: sql<number>`count(*)`.mapWith(Number) })
        .from(s)
        .where(sql`${s.created_at} >= ${agoMinutes(24 * 60)}`)
        .groupBy(s.status);
      const recent = await db
        .select({ id: s.id, device_id: s.device_id, phone_number: s.phone_number, status: s.status, created_at: s.created_at, sent_at: s.sent_at })
        .from(s)
        .orderBy(desc(s.created_at))
        .limit(5);
      return { counts: Object.fromEntries(rows.map((r) => [r.status, r.count])), recent, timestamp: new Date().toISOString() };
    });
  }
}
