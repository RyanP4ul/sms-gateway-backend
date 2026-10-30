import { asc, count, eq } from 'drizzle-orm';
import { status } from 'elysia';
import { contacts, db } from '@/db';
import { pageMeta, paginate } from '@/lib/pagination';
import { validatePhoneNumber } from '@/lib/validation';
import type { ContactsModel } from './model';

export abstract class Contacts {
  static async create({ name, phone_number, group_name }: ContactsModel['createBody']) {
    const n = name.trim();
    const phone = validatePhoneNumber(phone_number);
    if (n === '' || n.length > 255) return status(400, { error: 'Contact name is required' });
    if (phone === null) return status(400, { error: 'A valid phone number is required' });
    const group = group_name ? [...group_name.trim()].slice(0, 100).join('') || null : null;

    const [row] = await db.insert(contacts).values({ name: n, phone_number: phone, group_name: group }).returning({ id: contacts.id });
    return status(201, { success: true, contact_id: row!.id, message: 'Contact added' });
  }

  static async list(query: ContactsModel['listQuery']) {
    const { page, limit, offset } = paginate(query);
    const where = query.group?.trim() ? eq(contacts.group_name, query.group.trim()) : undefined;
    const [{ total = 0 } = {}] = await db.select({ total: count() }).from(contacts).where(where);
    const rows = await db
      .select({ id: contacts.id, name: contacts.name, phone_number: contacts.phone_number, group_name: contacts.group_name, created_at: contacts.created_at })
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.name))
      .limit(limit)
      .offset(offset);
    return { success: true, ...pageMeta(total, page, limit), contacts: rows };
  }
}

