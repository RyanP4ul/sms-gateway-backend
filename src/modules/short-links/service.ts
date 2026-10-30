import { desc, eq, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { db, shortLinks } from '@/db';
import { randomFromAlphabet } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { ShortLinksModel } from './model';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // no l / 0 / 1 / o-lookalikes

export abstract class ShortLinks {
  static async create({ url, ttl_hours }: ShortLinksModel['createBody']) {
    const target = url.trim();
    let valid = target !== '' && target.length <= 2000;
    if (valid) {
      try {
        const p = new URL(target).protocol;
        valid = p === 'http:' || p === 'https:'; // blocks javascript:/data: redirect targets
      } catch { valid = false; }
    }
    if (!valid) return status(400, { error: 'A valid URL is required (maks 2000 karakter)' });

    const expiresAt = ttl_hours !== undefined ? new Date(Date.now() + Math.max(1, Math.trunc(ttl_hours)) * 3_600_000) : null;

    // Retry on the (rare) code collision instead of failing with a 500.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomFromAlphabet(ALPHABET, 6);
      const rows = await db
        .insert(shortLinks)
        .values({ short_code: code, original_url: target, expires_at: expiresAt })
        .onConflictDoNothing()
        .returning({ code: shortLinks.short_code });
      if (rows.length) {
        return status(201, { success: true, short_code: code, short_url: `${env.APP_URL}/r/${code}`, expires_at: expiresAt });
      }
    }
    return status(500, { error: 'Could not generate short code' });
  }

  static async list() {
    const links = await db
      .select({
        id: shortLinks.id, short_code: shortLinks.short_code, original_url: shortLinks.original_url,
        click_count: shortLinks.click_count, expires_at: shortLinks.expires_at, created_at: shortLinks.created_at,
      })
      .from(shortLinks)
      .orderBy(desc(shortLinks.created_at))
      .limit(100);
    return { success: true, links: links.map((l) => ({ ...l, short_url: `${env.APP_URL}/r/${l.short_code}` })) };
  }

  /** Returns the target URL and counts the click, or an error response. */
  static async resolve(code: string) {
    if (code === '' || code.length > 10) return status(400, { error: 'Invalid short code' });
    const [link] = await db.select({ url: shortLinks.original_url, expires_at: shortLinks.expires_at }).from(shortLinks).where(eq(shortLinks.short_code, code)).limit(1);
    if (!link) return status(404, { error: 'Link not found' });
    if (link.expires_at !== null && link.expires_at.getTime() < Date.now()) return status(410, { error: 'Link expired' });
    await db.update(shortLinks).set({ click_count: sql`${shortLinks.click_count} + 1` }).where(eq(shortLinks.short_code, code));
    return { url: link.url };
  }
}

