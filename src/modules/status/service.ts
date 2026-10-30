import { desc, eq, inArray, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { db, statusIncidents, systemStatus, uptimeChecks } from '@/db';
import type { RequestMeta } from '@/lib/request';
import { agoDays } from '@/lib/sql';
import { Audit } from '../audit/service';
import type { StatusModel } from './model';

export abstract class SystemStatus {
  /** Public, unauthenticated payload for the status page. */
  static async publicStatus() {
    const components = await db
      .select({ component: systemStatus.component, status: systemStatus.status, message: systemStatus.message, updated_at: systemStatus.updated_at })
      .from(systemStatus)
      .where(eq(systemStatus.is_public, true))
      .orderBy(systemStatus.component);

    const recent_incidents = await db
      .select({
        id: statusIncidents.id, title: statusIncidents.title, description: statusIncidents.description, severity: statusIncidents.severity,
        status: statusIncidents.status, affected_components: statusIncidents.affected_components, resolved_at: statusIncidents.resolved_at,
        created_at: statusIncidents.created_at, updated_at: statusIncidents.updated_at,
      })
      .from(statusIncidents)
      .where(sql`${statusIncidents.created_at} >= ${agoDays(7)}`)
      .orderBy(desc(statusIncidents.created_at))
      .limit(10);

    const [uptime] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        up: sql<number>`count(*) filter (where ${uptimeChecks.is_up})`.mapWith(Number),
      })
      .from(uptimeChecks)
      .where(sql`${uptimeChecks.check_type} = 'api' and ${uptimeChecks.created_at} >= ${agoDays(30)}`);
    const uptime_30d = uptime && uptime.total > 0 ? Math.round((uptime.up / uptime.total) * 10_000) / 100 : 100;

    let overall_status: (typeof components)[number]['status'] = 'operational';
    for (const c of components) {
      if (c.status === 'major_outage') { overall_status = 'major_outage'; break; }
      if (c.status === 'partial_outage') overall_status = 'partial_outage';
      if (c.status === 'degraded' && overall_status === 'operational') overall_status = 'degraded';
    }
    return { success: true, overall_status, uptime_30d, components, recent_incidents };
  }

  static async adminOverview() {
    const components = await db.select().from(systemStatus).orderBy(systemStatus.component);
    const incidents = await db.select().from(statusIncidents).orderBy(desc(statusIncidents.created_at)).limit(20);
    return { success: true, components, incidents };
  }

  static async updateComponent({ component, status: next, message }: StatusModel['componentBody'], meta: RequestMeta) {
    const updated = await db
      .update(systemStatus)
      .set({ status: next, message: message?.trim() ?? '', updated_by: 'admin' })
      .where(eq(systemStatus.component, component.trim()))
      .returning({ id: systemStatus.id });
    if (updated.length === 0) return status(404, { error: 'Component not found' });
    await Audit.log({ action: 'system_status.updated', actorType: 'admin', details: { component, status: next }, meta });
    return { success: true, message: `Status updated: ${component} -> ${next}` };
  }

  static async createIncident(body: StatusModel['createIncidentBody'], meta: RequestMeta) {
    const title = body.title.trim();
    if (title === '') return status(400, { error: 'title is required' });
    const severity = body.severity ?? 'minor';
    const affected = body.affected_components ?? [];

    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(statusIncidents)
        .values({ title, description: body.description?.trim() ?? '', severity, affected_components: affected.length ? affected : null })
        .returning({ id: statusIncidents.id });
      if (affected.length) {
        const next = severity === 'critical' ? 'major_outage' : severity === 'major' ? 'partial_outage' : 'degraded';
        await tx.update(systemStatus).set({ status: next, updated_by: 'system' }).where(inArray(systemStatus.component, affected));
      }
      return row!.id;
    });
    await Audit.log({ action: 'incident.created', actorType: 'admin', details: { title, severity }, meta });
    return status(201, { success: true, incident_id: id, message: 'Incident created' });
  }

  static async updateIncident({ id, status: next, description }: StatusModel['updateIncidentBody'], meta: RequestMeta) {
    const incidentId = Math.trunc(id);
    const found = await db.transaction(async (tx) => {
      const [incident] = await tx.select({ affected: statusIncidents.affected_components }).from(statusIncidents).where(eq(statusIncidents.id, incidentId)).limit(1);
      if (!incident) return false;
      if (next === 'resolved' && incident.affected?.length) {
        await tx.update(systemStatus).set({ status: 'operational', updated_by: 'system' }).where(inArray(systemStatus.component, incident.affected));
      }
      await tx
        .update(statusIncidents)
        .set({
          status: next,
          ...(next === 'resolved' ? { resolved_at: sql`now()` } : {}),
          ...(description?.trim() ? { description: description.trim() } : {}),
        })
        .where(eq(statusIncidents.id, incidentId));
      return true;
    });
    if (!found) return status(404, { error: 'Incident not found' });
    await Audit.log({ action: 'incident.updated', actorType: 'admin', details: { incident_id: incidentId, status: next }, meta });
    return { success: true, message: 'Incident updated' };
  }

  static async listIncidents({ status: state, limit }: StatusModel['incidentsQuery']) {
    const incidents = await db
      .select()
      .from(statusIncidents)
      .where(state ? eq(statusIncidents.status, state) : undefined)
      .orderBy(desc(statusIncidents.created_at))
      .limit(Math.min(Math.max(1, Math.trunc(limit ?? 50)), 200));
    return { success: true, incidents };
  }
}

