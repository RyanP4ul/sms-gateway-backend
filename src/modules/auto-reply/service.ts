import { desc, eq } from 'drizzle-orm';
import { status } from 'elysia';
import { autoReplyRules, db } from '@/db';
import type { AutoReplyModel } from './model';

const regexMatches = (pattern: string, text: string): boolean => {
  try {
    return new RegExp(pattern, 'iu').test(text);
  } catch {
    return false;
  }
};

export abstract class AutoReply {
  static async create({ keyword, match_type = 'contains', reply_message }: AutoReplyModel['createBody']) {
    const kw = keyword.trim();
    const reply = reply_message.trim();
    if (kw === '' || kw.length > 100) return status(400, { error: 'Keyword is required (max 100 characters)' });
    if (reply === '') return status(400, { error: 'Reply message is required' });
    if (match_type === 'regex') {
      try { new RegExp(kw, 'iu'); } catch { return status(400, { error: 'Invalid regex expression' }); }
    }

    const [row] = await db.insert(autoReplyRules).values({ keyword: kw, match_type, reply_message: reply }).returning({ id: autoReplyRules.id });
    return status(201, { success: true, rule_id: row!.id, message: 'Auto-reply rule created' });
  }

  static async list() {
    const rules = await db
      .select({
        id: autoReplyRules.id, keyword: autoReplyRules.keyword, match_type: autoReplyRules.match_type, reply_message: autoReplyRules.reply_message,
        is_active: autoReplyRules.is_active, usage_count: autoReplyRules.usage_count, created_at: autoReplyRules.created_at,
      })
      .from(autoReplyRules)
      .orderBy(desc(autoReplyRules.created_at));
    return { success: true, rules };
  }

  static async remove(id: number) {
    const deleted = await db.delete(autoReplyRules).where(eq(autoReplyRules.id, id)).returning({ id: autoReplyRules.id });
    if (deleted.length === 0) return status(404, { error: 'Rule not found' });
    return { success: true, message: 'Rule deleted' };
  }

  /** First active rule (oldest first) that matches the incoming text. */
  static async findMatch(message: string) {
    const rules = await db.select().from(autoReplyRules).where(eq(autoReplyRules.is_active, true)).orderBy(autoReplyRules.id);
    const lower = message.toLowerCase();
    return (
      rules.find((r) => {
        const kw = r.keyword.toLowerCase();
        switch (r.match_type) {
          case 'exact': return lower === kw;
          case 'contains': return lower.includes(kw);
          case 'starts_with': return lower.startsWith(kw);
          case 'regex': return regexMatches(r.keyword, message);
        }
      }) ?? null
    );
  }
}

