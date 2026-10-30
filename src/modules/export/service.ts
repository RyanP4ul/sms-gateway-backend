import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { auditLogs, db, devices, smsRequests } from '@/db';
import { toCsv } from '@/lib/csv';
import { agoDays } from '@/lib/sql';
import type { ExportModel } from './model';

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);

export abstract class Export {
  /** Returns a ready-to-send CSV `Response` (UTF-8 BOM so Excel reads accented characters correctly). */
  static async csv({ type = 'sms', days: rawDays, device_id }: ExportModel['csvQuery']) {
    const days = Math.max(1, Math.min(365, Math.trunc(rawDays ?? 30)));
    let csv: string;

    if (type === 'sms') {
      const r = smsRequests;
      const rows = await db
        .select({ id: r.id, device_id: r.device_id, phone_number: r.phone_number, status: r.status, priority: r.priority, batch_id: r.batch_id, sent_at: r.sent_at, error_message: r.error_message, retry_count: r.retry_count, created_at: r.created_at })
        .from(r)
        .where(and(sql`${r.created_at} >= ${agoDays(days)}`, device_id ? eq(r.device_id, device_id) : undefined))
        .orderBy(desc(r.created_at))
        .limit(10_000);
      csv = toCsv(
        ['ID', 'Device', 'Phone', 'Status', 'Priority', 'Batch', 'Sent', 'Error', 'Attempts', 'Created'],
        rows.map((x) => [x.id, x.device_id, x.phone_number, x.status, x.priority, x.batch_id, x.sent_at, x.error_message, x.retry_count, x.created_at]),
      );
    } else if (type === 'devices') {
      const d = devices;
      const rows = await db
        .select({ device_id: d.device_id, device_name: d.device_name, phone_number: d.phone_number, is_active: d.is_active, performance_score: d.performance_score, total_sent: d.total_sent, total_failed: d.total_failed, cost_per_sms: d.cost_per_sms, last_seen: d.last_seen, created_at: d.created_at })
        .from(d)
        .where(isNull(d.deleted_at))
        .orderBy(d.device_id);
      csv = toCsv(
        ['DeviceID', 'Name', 'Phone', 'Active', 'Score', 'Sent', 'Failed', 'SMS Cost', 'Last Seen', 'Created'],
        rows.map((x) => [x.device_id, x.device_name, x.phone_number, x.is_active ? 1 : 0, x.performance_score, x.total_sent, x.total_failed, x.cost_per_sms, x.last_seen, x.created_at]),
      );
    } else {
      const a = auditLogs;
      const rows = await db
        .select({ id: a.id, action: a.action, actor_type: a.actor_type, actor_id: a.actor_id, ip_address: a.ip_address, request_method: a.request_method, request_path: a.request_path, created_at: a.created_at })
        .from(a)
        .where(sql`${a.created_at} >= ${agoDays(days)}`)
        .orderBy(desc(a.created_at))
        .limit(10_000);
      csv = toCsv(
        ['ID', 'Action', 'ActorType', 'ActorID', 'IP', 'Method', 'Path', 'Time'],
        rows.map((x) => [x.id, x.action, x.actor_type, x.actor_id, x.ip_address, x.request_method, x.request_path, x.created_at]),
      );
    }

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="export_${type}_${stamp()}.csv"`,
      },
    });
  }
}
