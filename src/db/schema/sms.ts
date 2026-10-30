import { boolean, check, index, integer, jsonb, numeric, pgTable, smallint, text, varchar, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, ts, updatedAt } from './_helpers';
import { matchType, smsStatus } from './enums';
import { devices } from './devices';

export const smsRequests = pgTable(
  'sms_requests',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    device_id: varchar({ length: 255 })
      .notNull()
      .references(() => devices.device_id, { onDelete: 'cascade' }),
    phone_number: varchar({ length: 20 }).notNull(),
    message: text().notNull(),
    status: smsStatus().notNull().default('pending'),
    priority: smallint().notNull().default(5),
    /** `YYYYMMDD-HHmmss-xxxxxxxx` bulk group id */
    batch_id: varchar({ length: 36 }),
    template_id: integer(),
    sim_slot: smallint().notNull().default(0),
    scheduled_at: ts(),
    sent_at: ts(),
    delivered_at: ts(),
    error_message: text(),
    retry_count: smallint().notNull().default(0),
    max_retries: smallint().notNull().default(3),
    next_retry_at: ts(),
    webhook_url: varchar({ length: 500 }),
    cost: numeric({ precision: 10, scale: 4, mode: 'number' }).notNull().default(0),
    message_parts: smallint().notNull().default(1),
    /** gsm7 | ucs2 */
    encoding: varchar({ length: 10 }).notNull().default('gsm7'),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    check('chk_sms_priority', sql`${t.priority} between 1 and 10`),
    index('idx_sms_device_status').on(t.device_id, t.status),
    index('idx_sms_status_priority').on(t.status, t.priority.desc(), t.created_at.asc()),
    index('idx_sms_scheduled').on(t.scheduled_at),
    index('idx_sms_retry').on(t.status, t.next_retry_at),
    index('idx_sms_batch').on(t.batch_id),
    index('idx_sms_created').on(t.created_at),
    index('idx_sms_phone').on(t.phone_number),
  ],
);

export const smsTemplates = pgTable(
  'sms_templates',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 100 }).notNull(),
    content: text().notNull(),
    variables: jsonb().$type<string[]>(),
    is_active: boolean().notNull().default(true),
    usage_count: integer().notNull().default(0),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_tpl_name').on(t.name), index('idx_tpl_active').on(t.is_active)],
);

export const incomingSms = pgTable(
  'incoming_sms',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    device_id: varchar({ length: 255 })
      .notNull()
      .references(() => devices.device_id, { onDelete: 'cascade' }),
    sender_number: varchar({ length: 20 }).notNull(),
    message: text().notNull(),
    received_at: ts().notNull().defaultNow(),
    is_read: boolean().notNull().default(false),
    auto_reply_sent: boolean().notNull().default(false),
    related_sms_id: integer(),
    created_at: createdAt(),
  },
  (t) => [
    index('idx_incoming_device_received').on(t.device_id, t.received_at.desc()),
    index('idx_incoming_sender').on(t.sender_number),
    index('idx_incoming_unread').on(t.is_read),
  ],
);

export const autoReplyRules = pgTable(
  'auto_reply_rules',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    keyword: varchar({ length: 100 }).notNull(),
    match_type: matchType().notNull().default('contains'),
    reply_message: text().notNull(),
    is_active: boolean().notNull().default(true),
    usage_count: integer().notNull().default(0),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_ar_keyword').on(t.keyword), index('idx_ar_active').on(t.is_active)],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    phone_number: varchar({ length: 20 }).notNull(),
    code: varchar({ length: 10 }).notNull(),
    purpose: varchar({ length: 50 }).notNull().default('verification'),
    is_used: boolean().notNull().default(false),
    attempts: integer().notNull().default(0),
    max_attempts: integer().notNull().default(3),
    expires_at: ts().notNull(),
    used_at: ts(),
    sms_request_id: integer(),
    created_at: createdAt(),
  },
  (t) => [
    index('idx_otp_phone_purpose').on(t.phone_number, t.purpose),
    index('idx_otp_code').on(t.code),
    index('idx_otp_expires').on(t.expires_at),
  ],
);

export const shortLinks = pgTable(
  'short_links',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    short_code: varchar({ length: 10 }).notNull().unique(),
    original_url: varchar({ length: 2000 }).notNull(),
    click_count: integer().notNull().default(0),
    expires_at: ts(),
    sms_request_id: integer(),
    created_at: createdAt(),
  },
  (t) => [index('idx_sl_expires').on(t.expires_at)],
);

export const contacts = pgTable(
  'contacts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    phone_number: varchar({ length: 20 }).notNull(),
    group_name: varchar({ length: 100 }),
    metadata: jsonb().$type<Record<string, unknown>>(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_contacts_phone').on(t.phone_number), index('idx_contacts_group').on(t.group_name)],
);

export const phoneBlacklist = pgTable('phone_blacklist', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  phone_number: varchar({ length: 20 }).notNull().unique(),
  reason: varchar({ length: 255 }),
  created_at: createdAt(),
});
