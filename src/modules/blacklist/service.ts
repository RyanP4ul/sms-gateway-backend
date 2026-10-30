import { and, desc, eq, inArray } from 'drizzle-orm';
import { status } from 'elysia';
import { db, phoneBlacklist, smsRequests } from '@/db';
import type { RequestMeta } from '@/lib/request';
import { maskPhone, validatePhoneNumber } from '@/lib/validation';
import { Audit } from '../audit/service';
import type { BlacklistModel } from './model';

export abstract class Blacklist {
  static async isBlacklisted(phone: string): Promise<boolean> {
    const [row] = await db.select({ id: phoneBlacklist.id }).from(phoneBlacklist).where(eq(phoneBlacklist.phone_number, phone)).limit(1);
    return row !== undefined;
  }

  /** Bulk lookup: which of these numbers are blacklisted? (one query instead of one per number) */
  static async filter(phones: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (let i = 0; i < phones.length; i += 5000) {
      const rows = await db
        .select({ phone: phoneBlacklist.phone_number })
        .from(phoneBlacklist)
        .where(inArray(phoneBlacklist.phone_number, phones.slice(i, i + 5000)));
      for (const r of rows) found.add(r.phone);
    }
    return found;
  }

  static async add({ phone_number, reason }: BlacklistModel['addBody'], meta: RequestMeta) {
    const phone = validatePhoneNumber(phone_number);
    if (phone === null) return status(400, { error: 'A valid phone number is required' });

    const inserted = await db
      .insert(phoneBlacklist)
      .values({ phone_number: phone, reason: reason ? [...reason.trim()].slice(0, 255).join('') : null })
      .onConflictDoNothing()
      .returning({ id: phoneBlacklist.id });
    if (inserted.length === 0) return status(409, { error: 'This number is already blacklisted' });

    // Queued messages to this number are no longer allowed to go out.
    await db
      .update(smsRequests)
      .set({ status: 'cancelled' })
      .where(and(eq(smsRequests.phone_number, phone), inArray(smsRequests.status, ['pending', 'processing'])));

    await Audit.log({ action: 'blacklist.added', actorType: 'admin', details: { phone: maskPhone(phone) }, meta });
    return status(201, { success: true, message: 'Number added to blacklist' });
  }

  static async list() {
    const rows = await db
      .select({ id: phoneBlacklist.id, phone_number: phoneBlacklist.phone_number, reason: phoneBlacklist.reason, created_at: phoneBlacklist.created_at })
      .from(phoneBlacklist)
      .orderBy(desc(phoneBlacklist.created_at));
    return { success: true, blacklist: rows };
  }

  static async remove(rawPhone: string, meta: RequestMeta) {
    const phone = validatePhoneNumber(rawPhone);
    if (phone === null) return status(400, { error: 'A valid phone number is required' });

    const deleted = await db.delete(phoneBlacklist).where(eq(phoneBlacklist.phone_number, phone)).returning({ id: phoneBlacklist.id });
    if (deleted.length === 0) return status(404, { error: 'Number not found in blacklist' });

    await Audit.log({ action: 'blacklist.removed', actorType: 'admin', details: { phone: maskPhone(phone) }, meta });
    return { success: true, message: 'Number removed from blacklist' };
  }
}

