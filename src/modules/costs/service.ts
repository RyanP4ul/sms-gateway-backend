import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { costRecords, db, devices } from '@/db';
import type { CostsModel } from './model';

export abstract class Costs {
  static async report({ days: rawDays, device_id }: CostsModel['reportQuery']) {
    const days = Math.max(1, Math.min(90, Math.trunc(rawDays ?? 30)));
    const since = sql`current_date - ${days}::int`;
    const where = and(sql`${costRecords.record_date} >= ${since}`, device_id ? eq(costRecords.device_id, device_id) : undefined);

    const records = await db
      .select({
        record_date: costRecords.record_date, device_id: costRecords.device_id, sms_count: costRecords.sms_count,
        total_cost: costRecords.total_cost, currency: costRecords.currency,
      })
      .from(costRecords)
      .where(where)
      .orderBy(desc(costRecords.record_date));

    const [summary] = await db
      .select({
        total: sql<number>`coalesce(sum(${costRecords.total_cost}), 0)`.mapWith(Number),
        total_sms: sql<number>`coalesce(sum(${costRecords.sms_count}), 0)`.mapWith(Number),
      })
      .from(costRecords)
      .where(where);

    const per_device = await db
      .select({
        device_id: devices.device_id,
        device_name: devices.device_name,
        cost_per_sms: devices.cost_per_sms,
        total_cost: sql<number>`coalesce(sum(${costRecords.total_cost}), 0)`.mapWith(Number),
        total_sms: sql<number>`coalesce(sum(${costRecords.sms_count}), 0)`.mapWith(Number),
      })
      .from(devices)
      .leftJoin(costRecords, and(eq(devices.device_id, costRecords.device_id), sql`${costRecords.record_date} >= ${since}`))
      .where(isNull(devices.deleted_at))
      .groupBy(devices.device_id, devices.device_name, devices.cost_per_sms);

    return {
      success: true,
      period_days: days,
      total_cost: summary?.total ?? 0,
      total_sms: summary?.total_sms ?? 0,
      records,
      per_device,
    };
  }
}
