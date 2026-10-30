import { boolean, index, integer, jsonb, numeric, pgTable, smallint, varchar } from 'drizzle-orm/pg-core';
import { createdAt, ts } from './_helpers';
import { commandStatus, commandType } from './enums';
import { users } from './users';

export const devices = pgTable(
  'devices',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    user_id: integer().references(() => users.id, { onDelete: 'set null' }),
    device_id: varchar({ length: 255 }).notNull().unique(),
    device_name: varchar({ length: 255 }),
    phone_number: varchar({ length: 20 }),
    api_key_hash: varchar({ length: 64 }).notNull(),
    api_key_prefix: varchar({ length: 8 }).notNull(),
    is_active: boolean().notNull().default(true),
    max_sms_per_minute: integer().notNull().default(10),
    /** 0 = default, 1 = SIM1, 2 = SIM2 */
    sim_slot: smallint().notNull().default(0),
    last_seen: ts(),
    deleted_at: ts(),
    /** 0-100 */
    performance_score: smallint().notNull().default(100),
    total_sent: integer().notNull().default(0),
    total_failed: integer().notNull().default(0),
    /** Load-balancing weight 1-100 */
    weight: integer().notNull().default(100),
    cost_per_sms: numeric({ precision: 10, scale: 4, mode: 'number' }).notNull().default(0),
    imei: varchar({ length: 20 }),
    imei2: varchar({ length: 20 }),
    android_version: varchar({ length: 20 }),
    sdk_version: integer(),
    device_model: varchar({ length: 100 }),
    device_brand: varchar({ length: 50 }),
    device_manufacturer: varchar({ length: 50 }),
    hardware_id: varchar({ length: 64 }),
    board: varchar({ length: 50 }),
    fingerprint: varchar({ length: 255 }),
    display_resolution: varchar({ length: 20 }),
    app_version: varchar({ length: 20 }),
    created_at: createdAt(),
    updated_at: ts().notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_devices_api_key_hash').on(t.api_key_hash),
    index('idx_devices_api_key_prefix').on(t.api_key_prefix),
    index('idx_devices_last_seen').on(t.last_seen),
    index('idx_devices_active_deleted').on(t.is_active, t.deleted_at),
    index('idx_devices_weight').on(t.weight),
  ],
);

/** Old keys kept for a grace period after rotation. */
export const apiKeyHistory = pgTable(
  'api_key_history',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    device_id: varchar({ length: 255 }).notNull(),
    api_key_hash: varchar({ length: 64 }).notNull(),
    api_key_prefix: varchar({ length: 8 }).notNull(),
    is_active: boolean().notNull().default(true),
    expires_at: ts(),
    rotated_at: ts(),
    created_at: createdAt(),
  },
  (t) => [
    index('idx_akh_device').on(t.device_id),
    index('idx_akh_hash').on(t.api_key_hash),
    index('idx_akh_expires').on(t.expires_at),
  ],
);

export const deviceScoreHistory = pgTable(
  'device_score_history',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    device_id: varchar({ length: 255 }).notNull(),
    score: smallint().notNull(),
    success_rate: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull(),
    avg_response_ms: integer(),
    uptime_pct: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull().default(100),
    recorded_at: ts().notNull().defaultNow(),
  },
  (t) => [index('idx_dsh_device_date').on(t.device_id, t.recorded_at)],
);

export const deviceCommands = pgTable(
  'device_commands',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    device_id: varchar({ length: 255 })
      .notNull()
      .references(() => devices.device_id, { onDelete: 'cascade' }),
    command_type: commandType().notNull(),
    payload: jsonb().$type<unknown>(),
    status: commandStatus().notNull().default('pending'),
    result: jsonb().$type<unknown>(),
    created_by: varchar({ length: 100 }).notNull().default('admin'),
    sent_at: ts(),
    executed_at: ts(),
    expires_at: ts(),
    created_at: createdAt(),
  },
  (t) => [
    index('idx_dc_device_status').on(t.device_id, t.status),
    index('idx_dc_status').on(t.status),
    index('idx_dc_expires').on(t.expires_at),
  ],
);
