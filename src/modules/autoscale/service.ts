import { desc, eq, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { autoscaleHistory, autoscaleRules, db } from '@/db';
import type { RequestMeta } from '@/lib/request';
import { Audit } from '../audit/service';
import type { AutoscaleModel } from './model';

export abstract class Autoscale {
  static async create(body: AutoscaleModel['createBody'], meta: RequestMeta) {
    const name = body.rule_name.trim();
    const up = Math.trunc(body.scale_up_threshold);
    const down = Math.trunc(body.scale_down_threshold);
    if (name === '') return status(400, { error: 'rule_name ve metric zorunludur' });
    if (up <= down) return status(400, { error: 'scale_up_threshold, scale_down_threshold dan büyük olmalı' });

    const [row] = await db
      .insert(autoscaleRules)
      .values({
        rule_name: name,
        metric: body.metric,
        scale_up_threshold: up,
        scale_down_threshold: down,
        min_devices: Math.trunc(body.min_devices ?? 1),
        max_devices: Math.trunc(body.max_devices ?? 10),
        cooldown_minutes: Math.trunc(body.cooldown_minutes ?? 5),
      })
      .returning({ id: autoscaleRules.id });
    await Audit.log({ action: 'autoscale_rule.created', actorType: 'admin', details: { rule_name: name, metric: body.metric }, meta });
    return status(201, { success: true, rule_id: row!.id, message: 'Ölçeklendirme kuralı oluşturuldu' });
  }

  static async list() {
    return { success: true, rules: await db.select().from(autoscaleRules).orderBy(desc(autoscaleRules.created_at)) };
  }

  static async remove(id: number, meta: RequestMeta) {
    const deleted = await db.delete(autoscaleRules).where(eq(autoscaleRules.id, id)).returning({ id: autoscaleRules.id });
    if (deleted.length === 0) return status(404, { error: 'Kural bulunamadı' });
    await Audit.log({ action: 'autoscale_rule.deleted', actorType: 'admin', details: { rule_id: id }, meta });
    return { success: true, message: 'Kural silindi' };
  }

  static async toggle({ id }: AutoscaleModel['toggleBody'], meta: RequestMeta) {
    const [row] = await db
      .update(autoscaleRules)
      .set({ is_active: sql`not ${autoscaleRules.is_active}` })
      .where(eq(autoscaleRules.id, Math.trunc(id)))
      .returning({ is_active: autoscaleRules.is_active });
    if (!row) return status(404, { error: 'Kural bulunamadı' });
    await Audit.log({ action: 'autoscale_rule.toggled', actorType: 'admin', details: { rule_id: id, is_active: row.is_active }, meta });
    return { success: true, is_active: row.is_active, message: row.is_active ? 'Kural aktifleştirildi' : 'Kural devre dışı bırakıldı' };
  }

  static async history({ limit }: AutoscaleModel['historyQuery']) {
    const history = await db
      .select({
        id: autoscaleHistory.id, rule_id: autoscaleHistory.rule_id, action: autoscaleHistory.action, device_id: autoscaleHistory.device_id,
        metric_value: autoscaleHistory.metric_value, threshold_value: autoscaleHistory.threshold_value,
        active_device_count: autoscaleHistory.active_device_count, details: autoscaleHistory.details, created_at: autoscaleHistory.created_at,
        rule_name: autoscaleRules.rule_name, metric: autoscaleRules.metric,
      })
      .from(autoscaleHistory)
      .leftJoin(autoscaleRules, eq(autoscaleHistory.rule_id, autoscaleRules.id))
      .orderBy(desc(autoscaleHistory.created_at))
      .limit(Math.min(Math.max(1, Math.trunc(limit ?? 50)), 200));
    return { success: true, history };
  }
}
