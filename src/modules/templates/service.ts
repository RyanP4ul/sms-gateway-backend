import { and, asc, eq, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { db, smsTemplates } from '@/db';
import { applyTemplate } from '@/lib/validation';
import type { TemplatesModel } from './model';

export abstract class Templates {
  static async create({ name, content, variables }: TemplatesModel['createBody']) {
    const n = name.trim();
    const c = content.trim();
    if (n === '' || n.length > 100) return status(400, { error: 'Template name is required (max 100 characters)' });
    if (c === '') return status(400, { error: 'Template content is required' });

    const [row] = await db.insert(smsTemplates).values({ name: n, content: c, variables: variables ?? [] }).returning({ id: smsTemplates.id });
    return status(201, { success: true, template_id: row!.id, message: 'Template created' });
  }

  static async list() {
    const rows = await db
      .select({
        id: smsTemplates.id, name: smsTemplates.name, content: smsTemplates.content, variables: smsTemplates.variables,
        is_active: smsTemplates.is_active, usage_count: smsTemplates.usage_count, created_at: smsTemplates.created_at,
      })
      .from(smsTemplates)
      .orderBy(asc(smsTemplates.name));
    return { success: true, templates: rows };
  }

  /** Fills a template and bumps its usage counter (one atomic statement). Returns null when missing/inactive. */
  static async resolve(templateId: number, variables: Record<string, unknown> = {}): Promise<string | null> {
    const [row] = await db
      .update(smsTemplates)
      .set({ usage_count: sql`${smsTemplates.usage_count} + 1` })
      .where(and(eq(smsTemplates.id, templateId), eq(smsTemplates.is_active, true)))
      .returning({ content: smsTemplates.content });
    return row ? applyTemplate(row.content, variables) : null;
  }
}

