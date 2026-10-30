import { boolean, index, integer, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import { createdAt, ts, updatedAt } from './_helpers';
import { userRole } from './enums';

/** Multi-tenant users. Present in the original schema but not used by any endpoint yet. */
export const users = pgTable(
  'users',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    username: varchar({ length: 100 }).notNull().unique(),
    password_hash: varchar({ length: 255 }).notNull(),
    role: userRole().notNull().default('user'),
    is_active: boolean().notNull().default(true),
    api_token_hash: varchar({ length: 64 }),
    api_token_prefix: varchar({ length: 8 }),
    max_devices: integer().notNull().default(5),
    max_sms_per_day: integer().notNull().default(1000),
    last_login_at: ts(),
    totp_secret: varchar({ length: 64 }),
    totp_enabled: boolean().notNull().default(false),
    totp_recovery_codes: jsonb().$type<string[]>(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_users_role').on(t.role), index('idx_users_token_hash').on(t.api_token_hash)],
);
