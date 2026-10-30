import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { auditLogs, db } from '@/db';
import { pageMeta, paginate } from '@/lib/pagination';
import type { RequestMeta } from '@/lib/request';
import type { AuditModel } from './model';

type ActorType = (typeof auditLogs.$inferInsert)['actor_type'];

export abstract class Audit {
  /** Never throws — an audit failure must not break the request (same as the PHP version). */
  static async log(entry: {
    action: string;
    actorType?: ActorType;
    actorId?: string | null;
    details?: Record<string, unknown> | null;
    meta?: RequestMeta;
  }): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        action: entry.action.slice(0, 50),
        actor_type: entry.actorType ?? 'anonymous',
        actor_id: entry.actorId ?? null,
        ip_address: entry.meta?.ip ?? null,
        user_agent: entry.meta?.userAgent ?? null,
        request_method: entry.meta?.method ?? null,
        request_path: entry.meta?.path ?? null,
        details: entry.details ?? null,
      });
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }

  static async list(query: AuditModel['listQuery']) {
    const { page, limit, offset } = paginate(query);
    const conditions: SQL[] = [];
    if (query.action) conditions.push(ilike(auditLogs.action, `%${query.action.replace(/[\\%_]/g, '\\$&')}%`));
    if (query.actor_type) conditions.push(eq(auditLogs.actor_type, query.actor_type));
    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total = 0 } = {}] = await db.select({ total: count() }).from(auditLogs).where(where);
    const logs = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.created_at)).limit(limit).offset(offset);
    return { success: true as const, ...pageMeta(total, page, limit), logs };
  }
}
