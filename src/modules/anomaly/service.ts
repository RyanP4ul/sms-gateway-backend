import { and, desc, eq, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { anomalyEvents, anomalyRules, db } from '@/db';
import { paginate } from '@/lib/pagination';
import type { AnomalyModel } from './model';

export abstract class Anomaly {
  static async listRules() {
    return { success: true, rules: await db.select().from(anomalyRules).orderBy(desc(anomalyRules.created_at)) };
  }

  static async createRule(body: AnomalyModel['createRuleBody']) {
    const name = body.rule_name.trim();
    const threshold = Math.trunc(body.threshold_value);
    if (name === '' || name.length > 100) return status(400, { error: 'Rule name is required (max 100)' });
    if (!(threshold > 0)) return status(400, { error: 'threshold_value must be positive' });

    const [row] = await db
      .insert(anomalyRules)
      .values({
        rule_name: name,
        rule_type: body.rule_type,
        threshold_value: threshold,
        time_window_minutes: Math.max(1, Math.trunc(body.time_window_minutes ?? 5)),
        action_type: body.action_type ?? 'alert',
      })
      .returning({ id: anomalyRules.id });
    return status(201, { success: true, rule_id: row!.id, message: 'Anomaly rule created' });
  }

  static async listEvents(query: AnomalyModel['eventsQuery']) {
    const { limit, offset } = paginate(query);
    const events = await db
      .select({
        ...eventColumns,
        rule_name: anomalyRules.rule_name,
        rule_type: anomalyRules.rule_type,
        action_type: anomalyRules.action_type,
      })
      .from(anomalyEvents)
      .innerJoin(anomalyRules, eq(anomalyEvents.rule_id, anomalyRules.id))
      .where(query.unresolved === '1' ? eq(anomalyEvents.is_resolved, false) : undefined)
      .orderBy(desc(anomalyEvents.created_at))
      .limit(limit)
      .offset(offset);
    return { success: true, events };
  }

  static async resolve({ event_id }: AnomalyModel['resolveBody']) {
    const id = Math.trunc(event_id);
    if (!(id > 0)) return status(400, { error: 'event_id is required' });
    const updated = await db
      .update(anomalyEvents)
      .set({ is_resolved: true, resolved_at: sql`now()` })
      .where(and(eq(anomalyEvents.id, id), eq(anomalyEvents.is_resolved, false)))
      .returning({ id: anomalyEvents.id });
    if (updated.length === 0) return status(404, { error: 'Event not found or already resolved' });
    return { success: true, message: 'Anomaly event resolved' };
  }
}

const eventColumns = {
  id: anomalyEvents.id, rule_id: anomalyEvents.rule_id, device_id: anomalyEvents.device_id, phone_number: anomalyEvents.phone_number,
  details: anomalyEvents.details, action_taken: anomalyEvents.action_taken, is_resolved: anomalyEvents.is_resolved,
  resolved_at: anomalyEvents.resolved_at, created_at: anomalyEvents.created_at,
};

