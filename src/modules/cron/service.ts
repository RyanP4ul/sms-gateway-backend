import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  anomalyEvents, anomalyRules, apiKeyHistory, auditLogs, autoscaleHistory, autoscaleRules, db, deviceCommands, deviceScoreHistory,
  devices, otpCodes, rateLimits, shortLinks, smsRequests, uptimeChecks,
} from '@/db';
import { env } from '@/lib/env';
import { ago, agoDays, agoHours, agoMinutes, countWhere } from '@/lib/sql';

const log = (msg: string) => console.log(`${new Date().toISOString()} - ${msg}`);
const s = smsRequests;
const OFFLINE = env.DEVICE_OFFLINE_THRESHOLD;

/**
 * The 20 jobs from cron.php. Each runs independently — one failing job no longer
 * prevents the rest from running (a PHP exception would abort the whole script).
 */
export abstract class Cron {
  private static running = false;

  static async runAll(): Promise<void> {
    if (Cron.running) return log('Previous cron run still in progress, skipping');
    Cron.running = true;
    try {
      for (const [name, job] of Object.entries(Cron.jobs)) {
        try { await job(); } catch (error) { console.error(`Cron job "${name}" failed:`, error); }
      }
      log('Cron tamamlandı');
    } finally {
      Cron.running = false;
    }
  }

  static readonly jobs: Record<string, () => Promise<void>> = {
    cleanRateLimits: async () => {
      const r = await db.delete(rateLimits).where(sql`${rateLimits.window_start} < ${agoMinutes(5)}`).returning({ id: rateLimits.id });
      if (r.length) log(`Rate limit temizlendi: ${r.length} kayıt`);
    },

    /** #2 Failed → pending once the back-off has elapsed. */
    retryFailed: async () => {
      const r = await db
        .update(s)
        .set({ status: 'pending' })
        .where(and(eq(s.status, 'failed'), sql`${s.retry_count} < ${s.max_retries} and ${s.next_retry_at} is not null and ${s.next_retry_at} <= now()`))
        .returning({ id: s.id });
      if (r.length) log(`Yeniden deneme kuyruğuna eklendi: ${r.length} SMS`);
    },

    /** #3 "processing" for 5+ minutes means the device vanished — put it back. */
    releaseStuck: async () => {
      const r = await db.update(s).set({ status: 'pending' }).where(and(eq(s.status, 'processing'), sql`${s.updated_at} < ${agoMinutes(5)}`)).returning({ id: s.id });
      if (r.length) log(`Takılı SMS serbest bırakıldı: ${r.length}`);
    },

    detectOffline: async () => {
      const rows = await db
        .select({ device_id: devices.device_id, secs: sql<number>`extract(epoch from (now() - ${devices.last_seen}))::int` })
        .from(devices)
        .where(and(isNull(devices.deleted_at), eq(devices.is_active, true), sql`${devices.last_seen} is not null and ${devices.last_seen} < ${ago(OFFLINE)}`));
      for (const d of rows) log(`Offline cihaz: ${d.device_id} (${d.secs}s)`);
    },

    /** #5 Finished messages older than 90 days. */
    purgeOldSms: async () => {
      const r = await db
        .delete(s)
        .where(and(sql`${s.status} in ('sent','delivered','cancelled','failed')`, sql`${s.created_at} < ${agoDays(90)}`, sql`${s.retry_count} >= ${s.max_retries}`))
        .returning({ id: s.id });
      if (r.length) log(`Arşivlendi/silindi: ${r.length} eski SMS`);
    },

    purgeOldAudit: async () => {
      const r = await db.delete(auditLogs).where(sql`${auditLogs.created_at} < ${agoDays(180)}`).returning({ id: auditLogs.id });
      if (r.length) log(`Audit log temizlendi: ${r.length} kayıt`);
    },

    dailyStats: async () => {
      await db.execute(sql`
        insert into daily_stats (stat_date, device_id, total_sent, total_failed, total_delivered, total_pending)
        select current_date, device_id,
               count(*) filter (where status = 'sent'), count(*) filter (where status = 'failed'),
               count(*) filter (where status = 'delivered'), count(*) filter (where status = 'pending')
        from sms_requests where created_at >= date_trunc('day', now()) group by device_id
        on conflict (stat_date, device_id) do update set
          total_sent = excluded.total_sent, total_failed = excluded.total_failed,
          total_delivered = excluded.total_delivered, total_pending = excluded.total_pending, updated_at = now()`);
    },

    hourlyStats: async () => {
      await db.execute(sql`
        insert into hourly_stats (stat_date, stat_hour, device_id, sent_count, failed_count)
        select created_at::date, extract(hour from created_at)::int, device_id,
               count(*) filter (where status = 'sent'), count(*) filter (where status = 'failed')
        from sms_requests where created_at >= now() - interval '2 hours'
        group by created_at::date, extract(hour from created_at), device_id
        on conflict (stat_date, stat_hour, device_id) do update set
          sent_count = excluded.sent_count, failed_count = excluded.failed_count`);
    },

    detectAnomalies: async () => {
      const rules = await db.select().from(anomalyRules).where(eq(anomalyRules.is_active, true));
      const hourNow = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: env.TIMEZONE }).format(new Date()));

      for (const rule of rules) {
        const window = agoMinutes(rule.time_window_minutes);
        let details: Record<string, unknown> | null = null;
        let blockDevices: string[] = [];

        const [{ cnt = 0 } = {}] = await db
          .select({ cnt: sql<number>`count(*)`.mapWith(Number) })
          .from(s)
          .where(sql`${s.created_at} >= ${window}`);

        switch (rule.rule_type) {
          case 'spike':
            if (cnt >= rule.threshold_value) details = { count: cnt, window_minutes: rule.time_window_minutes };
            break;
          case 'night_activity':
            if ((hourNow >= 23 || hourNow < 6) && cnt >= rule.threshold_value) details = { count: cnt, hour: hourNow };
            break;
          case 'same_number': {
            const floods = await db
              .select({ phone_number: s.phone_number, cnt: sql<number>`count(*)`.mapWith(Number) })
              .from(s)
              .where(sql`${s.created_at} >= ${window}`)
              .groupBy(s.phone_number)
              .having(sql`count(*) >= ${rule.threshold_value}`);
            if (floods.length) details = { numbers: floods };
            break;
          }
          case 'high_fail_rate': {
            const bad = await db
              .select({ device_id: s.device_id, total: sql<number>`count(*)`.mapWith(Number), failed: countWhere(sql`${s.status} = 'failed'`) })
              .from(s)
              .where(sql`${s.created_at} >= ${window} and ${s.status} in ('sent','failed')`)
              .groupBy(s.device_id)
              .having(sql`count(*) filter (where ${s.status} = 'failed') * 100.0 / count(*) >= ${rule.threshold_value}`);
            if (bad.length) { details = { devices: bad }; blockDevices = bad.map((b) => b.device_id); }
            break;
          }
        }
        if (!details) continue;

        // One event per rule per 15 minutes.
        const [recent] = await db
          .select({ id: anomalyEvents.id })
          .from(anomalyEvents)
          .where(and(eq(anomalyEvents.rule_id, rule.id), sql`${anomalyEvents.created_at} >= ${agoMinutes(15)}`))
          .limit(1);
        if (recent) continue;

        await db.insert(anomalyEvents).values({ rule_id: rule.id, details, action_taken: rule.action_type });
        log(`Anomali tespit: ${rule.rule_name} [${rule.action_type}]`);

        if (rule.action_type === 'block_device' && blockDevices.length) {
          await db.update(devices).set({ is_active: false }).where(sql`${devices.device_id} in ${blockDevices}`);
        }
      }
    },

    uptimeChecks: async () => {
      const t0 = performance.now();
      let up = true;
      try { await db.execute(sql`select 1`); } catch { up = false; }
      await db.insert(uptimeChecks).values({ check_type: 'api', target_id: 'main', is_up: up, response_time_ms: Math.round(performance.now() - t0) });

      const active = await db.select({ device_id: devices.device_id, last_seen: devices.last_seen }).from(devices).where(and(isNull(devices.deleted_at), eq(devices.is_active, true)));
      if (active.length) {
        await db.insert(uptimeChecks).values(
          active.map((d) => ({
            check_type: 'device' as const,
            target_id: d.device_id,
            is_up: d.last_seen !== null && (Date.now() - d.last_seen.getTime()) / 1000 < OFFLINE,
            response_time_ms: null,
          })),
        );
      }
    },

    /** #11 score = 60 % success rate (24 h) + 40 % uptime (24 h). */
    deviceScores: async () => {
      const all = await db.select({ device_id: devices.device_id }).from(devices).where(isNull(devices.deleted_at));
      const rate24 = await db
        .select({ device_id: s.device_id, sent: countWhere(sql`${s.status} = 'sent'`), failed: countWhere(sql`${s.status} = 'failed'`) })
        .from(s)
        .where(sql`${s.created_at} >= ${agoHours(24)}`)
        .groupBy(s.device_id);
      const up24 = await db
        .select({ id: uptimeChecks.target_id, total: sql<number>`count(*)`.mapWith(Number), up: countWhere(sql`${uptimeChecks.is_up}`) })
        .from(uptimeChecks)
        .where(sql`${uptimeChecks.check_type} = 'device' and ${uptimeChecks.created_at} >= ${agoHours(24)}`)
        .groupBy(uptimeChecks.target_id);
      const totals = await db
        .select({ device_id: s.device_id, sent: countWhere(sql`${s.status} = 'sent'`), failed: countWhere(sql`${s.status} = 'failed'`) })
        .from(s)
        .groupBy(s.device_id);

      const r24 = new Map(rate24.map((r) => [r.device_id, r]));
      const u24 = new Map(up24.map((r) => [r.id, r]));
      const tot = new Map(totals.map((r) => [r.device_id, r]));

      for (const { device_id } of all) {
        const r = r24.get(device_id);
        const sent = r?.sent ?? 0;
        const failed = r?.failed ?? 0;
        const successRate = sent + failed > 0 ? (sent / (sent + failed)) * 100 : 100;
        const u = u24.get(device_id);
        const uptimePct = u && u.total > 0 ? (u.up / u.total) * 100 : 100;
        const score = Math.max(0, Math.min(100, Math.round(successRate * 0.6 + uptimePct * 0.4)));

        await db.update(devices).set({ performance_score: score, total_sent: tot.get(device_id)?.sent ?? 0, total_failed: tot.get(device_id)?.failed ?? 0 }).where(eq(devices.device_id, device_id));
        await db.insert(deviceScoreHistory).values({ device_id, score, success_rate: Math.round(successRate * 100) / 100, uptime_pct: Math.round(uptimePct * 100) / 100 });
      }
    },

    costRecords: async () => {
      await db.execute(sql`
        insert into cost_records (record_date, device_id, sms_count, total_cost)
        select current_date, sr.device_id, count(*), count(*) * coalesce(d.cost_per_sms, 0)
        from sms_requests sr join devices d on sr.device_id = d.device_id
        where sr.sent_at >= date_trunc('day', now()) and sr.status = 'sent'
        group by sr.device_id, d.cost_per_sms
        on conflict (record_date, device_id) do update set sms_count = excluded.sms_count, total_cost = excluded.total_cost`);
    },

    /** #13–#17 retention / housekeeping */
    housekeeping: async () => {
      await db.delete(otpCodes).where(sql`${otpCodes.expires_at} < ${agoHours(24)}`);
      await db.delete(shortLinks).where(sql`${shortLinks.expires_at} is not null and ${shortLinks.expires_at} < ${agoDays(30)}`);
      await db.delete(uptimeChecks).where(sql`${uptimeChecks.created_at} < ${agoDays(30)}`);
      await db.delete(deviceScoreHistory).where(sql`${deviceScoreHistory.recorded_at} < ${agoDays(90)}`);
      const expired = await db
        .update(apiKeyHistory)
        .set({ is_active: false })
        .where(and(eq(apiKeyHistory.is_active, true), sql`${apiKeyHistory.expires_at} is not null and ${apiKeyHistory.expires_at} < now()`))
        .returning({ id: apiKeyHistory.id });
      if (expired.length) log(`Süresi dolmuş API key: ${expired.length}`);
    },

    autoscale: async () => {
      const rules = await db.select().from(autoscaleRules).where(eq(autoscaleRules.is_active, true));
      for (const rule of rules) {
        if (rule.last_action_at && Date.now() - rule.last_action_at.getTime() < rule.cooldown_minutes * 60_000) continue;

        let value = 0;
        if (rule.metric === 'queue_size') {
          [{ value = 0 } = {}] = await db.select({ value: sql<number>`count(*)`.mapWith(Number) }).from(s).where(eq(s.status, 'pending'));
        } else if (rule.metric === 'fail_rate') {
          const [r] = await db
            .select({ total: sql<number>`count(*)`.mapWith(Number), failed: countWhere(sql`${s.status} = 'failed'`) })
            .from(s)
            .where(sql`${s.created_at} >= ${agoMinutes(10)} and ${s.status} in ('sent','failed')`);
          value = r && r.total > 0 ? Math.round((r.failed / r.total) * 100) : 0;
        } else if (rule.metric === 'throughput') {
          [{ value = 0 } = {}] = await db.select({ value: sql<number>`count(*)`.mapWith(Number) }).from(s).where(sql`${s.status} = 'sent' and ${s.sent_at} >= ${agoMinutes(5)}`);
        } else {
          const [r] = await db
            .select({ v: sql<number | null>`avg(extract(epoch from (${s.sent_at} - ${s.created_at})))`.mapWith((x) => (x === null ? null : Number(x))) })
            .from(s)
            .where(sql`${s.status} = 'sent' and ${s.sent_at} is not null and ${s.created_at} >= ${agoMinutes(10)}`);
          value = Math.round(r?.v ?? 0);
        }

        const [{ activeCount = 0 } = {}] = await db
          .select({ activeCount: sql<number>`count(*)`.mapWith(Number) })
          .from(devices)
          .where(and(eq(devices.is_active, true), isNull(devices.deleted_at)));

        let action: 'scale_up' | 'scale_down' | null = null;
        let target: string | null = null;

        if (value >= rule.scale_up_threshold && activeCount < rule.max_devices) {
          const [d] = await db.select({ device_id: devices.device_id }).from(devices).where(and(eq(devices.is_active, false), isNull(devices.deleted_at))).orderBy(desc(devices.performance_score)).limit(1);
          if (d) { await db.update(devices).set({ is_active: true }).where(eq(devices.device_id, d.device_id)); action = 'scale_up'; target = d.device_id; log(`Auto-Scale UP: ${d.device_id} aktifleştirildi (metric: ${value})`); }
        }
        if (value <= rule.scale_down_threshold && activeCount > rule.min_devices) {
          const [d] = await db.select({ device_id: devices.device_id }).from(devices).where(and(eq(devices.is_active, true), isNull(devices.deleted_at))).orderBy(asc(devices.performance_score)).limit(1);
          if (d) { await db.update(devices).set({ is_active: false }).where(eq(devices.device_id, d.device_id)); action = 'scale_down'; target = d.device_id; log(`Auto-Scale DOWN: ${d.device_id} devre dışı bırakıldı (metric: ${value})`); }
        }

        if (action) {
          await db.insert(autoscaleHistory).values({
            rule_id: rule.id, action, device_id: target, metric_value: value,
            threshold_value: action === 'scale_up' ? rule.scale_up_threshold : rule.scale_down_threshold,
            active_device_count: activeCount, details: { metric: rule.metric, rule_name: rule.rule_name },
          });
          await db.update(autoscaleRules).set({ last_action_at: sql`now()`, last_action: action }).where(eq(autoscaleRules.id, rule.id));
        }
      }
    },

    expireCommands: async () => {
      const r = await db
        .update(deviceCommands)
        .set({ status: 'expired' })
        .where(and(eq(deviceCommands.status, 'pending'), sql`${deviceCommands.expires_at} is not null and ${deviceCommands.expires_at} < now()`))
        .returning({ id: deviceCommands.id });
      if (r.length) log(`Süresi dolmuş komut: ${r.length}`);
    },

    /** #20 Derive public status-page component states from live metrics. */
    updateSystemStatus: async () => {
      const level = (v: number, steps: [number, string][], ok = 'operational') => steps.find(([min]) => v < min)?.[1] ?? ok;
      const set = (component: string, status: string) =>
        db.execute(sql`update system_status set status = ${status}::component_status, updated_by = 'system', updated_at = now() where component = ${component}`);

      const [api] = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number), up: countWhere(sql`${uptimeChecks.is_up}`) })
        .from(uptimeChecks)
        .where(sql`${uptimeChecks.check_type} = 'api' and ${uptimeChecks.created_at} >= ${agoMinutes(10)}`);
      const apiPct = api && api.total > 0 ? (api.up / api.total) * 100 : 100;
      await set('api', level(apiPct, [[50, 'major_outage'], [80, 'partial_outage'], [95, 'degraded']]));

      const [net] = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number), online: countWhere(sql`${devices.is_active} and ${devices.last_seen} >= ${agoMinutes(5)}`) })
        .from(devices)
        .where(isNull(devices.deleted_at));
      const onlinePct = net && net.total > 0 ? (net.online / net.total) * 100 : 100;
      await set('device_network', level(onlinePct, [[30, 'major_outage'], [60, 'partial_outage'], [80, 'degraded']]));

      const [sms] = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number), failed: countWhere(sql`${s.status} = 'failed'`) })
        .from(s)
        .where(sql`${s.created_at} >= ${agoMinutes(10)}`);
      const failPct = sms && sms.total > 0 ? (sms.failed / sms.total) * 100 : 0;
      await set('sms_sending', failPct > 50 ? 'major_outage' : failPct > 30 ? 'partial_outage' : failPct > 15 ? 'degraded' : 'operational');
    },
  };
}
