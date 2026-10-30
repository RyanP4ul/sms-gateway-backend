import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, unique, varchar } from 'drizzle-orm/pg-core';
import { createdAt, ts, updatedAt } from './_helpers';
import {
  actorType, alertChannelType, anomalyActionType, anomalyRuleType, autoscaleAction, autoscaleMetric,
  componentStatus, incidentSeverity, incidentStatus, uptimeCheckType,
} from './enums';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    action: varchar({ length: 50 }).notNull(),
    actor_type: actorType().notNull().default('anonymous'),
    actor_id: varchar({ length: 255 }),
    ip_address: varchar({ length: 45 }),
    user_agent: varchar({ length: 500 }),
    request_method: varchar({ length: 10 }),
    request_path: varchar({ length: 255 }),
    response_code: smallint(),
    details: jsonb().$type<Record<string, unknown>>(),
    created_at: createdAt(),
  },
  (t) => [
    index('idx_audit_action').on(t.action),
    index('idx_audit_actor').on(t.actor_type, t.actor_id),
    index('idx_audit_created').on(t.created_at),
    index('idx_audit_ip').on(t.ip_address),
  ],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    identifier: varchar({ length: 255 }).notNull(),
    endpoint: varchar({ length: 100 }).notNull().default('global'),
    request_count: integer().notNull().default(1),
    window_start: ts().notNull().defaultNow(),
  },
  (t) => [unique('uk_rate_identifier_endpoint').on(t.identifier, t.endpoint), index('idx_rate_window').on(t.window_start)],
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    url: varchar({ length: 500 }).notNull(),
    events: jsonb().$type<string[]>().notNull(),
    /** HMAC signing key */
    secret: varchar({ length: 64 }),
    is_active: boolean().notNull().default(true),
    last_triggered_at: ts(),
    failure_count: integer().notNull().default(0),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_webhooks_active').on(t.is_active)],
);

export const dailyStats = pgTable(
  'daily_stats',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    stat_date: date({ mode: 'string' }).notNull(),
    device_id: varchar({ length: 255 }),
    total_sent: integer().notNull().default(0),
    total_failed: integer().notNull().default(0),
    total_delivered: integer().notNull().default(0),
    total_pending: integer().notNull().default(0),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique('uk_daily_date_device').on(t.stat_date, t.device_id)],
);

export const hourlyStats = pgTable(
  'hourly_stats',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    stat_date: date({ mode: 'string' }).notNull(),
    stat_hour: smallint().notNull(),
    device_id: varchar({ length: 255 }),
    sent_count: integer().notNull().default(0),
    failed_count: integer().notNull().default(0),
    avg_send_time_ms: integer(),
    created_at: createdAt(),
  },
  (t) => [unique('uk_hourly_date_hour_device').on(t.stat_date, t.stat_hour, t.device_id), index('idx_hourly_date').on(t.stat_date)],
);

export const costRecords = pgTable(
  'cost_records',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    record_date: date({ mode: 'string' }).notNull(),
    device_id: varchar({ length: 255 }),
    sms_count: integer().notNull().default(0),
    total_cost: numeric({ precision: 10, scale: 4, mode: 'number' }).notNull().default(0),
    currency: varchar({ length: 3 }).notNull().default('TRY'),
    created_at: createdAt(),
  },
  (t) => [unique('uk_cost_date_device').on(t.record_date, t.device_id)],
);

export const uptimeChecks = pgTable(
  'uptime_checks',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    check_type: uptimeCheckType().notNull(),
    target_id: varchar({ length: 255 }),
    is_up: boolean().notNull().default(true),
    response_time_ms: integer(),
    error_message: varchar({ length: 500 }),
    created_at: createdAt(),
  },
  (t) => [index('idx_uptime_type_target').on(t.check_type, t.target_id), index('idx_uptime_created').on(t.created_at)],
);

export const anomalyRules = pgTable(
  'anomaly_rules',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    rule_name: varchar({ length: 100 }).notNull(),
    rule_type: anomalyRuleType().notNull(),
    threshold_value: integer().notNull(),
    time_window_minutes: integer().notNull().default(5),
    action_type: anomalyActionType().notNull().default('alert'),
    is_active: boolean().notNull().default(true),
    created_at: createdAt(),
  },
  (t) => [index('idx_anomaly_rules_active').on(t.is_active)],
);

export const anomalyEvents = pgTable(
  'anomaly_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    rule_id: integer()
      .notNull()
      .references(() => anomalyRules.id, { onDelete: 'cascade' }),
    device_id: varchar({ length: 255 }),
    phone_number: varchar({ length: 20 }),
    details: jsonb().$type<Record<string, unknown>>(),
    action_taken: varchar({ length: 50 }),
    is_resolved: boolean().notNull().default(false),
    resolved_at: ts(),
    created_at: createdAt(),
  },
  (t) => [
    index('idx_anomaly_events_rule').on(t.rule_id),
    index('idx_anomaly_events_created').on(t.created_at),
    index('idx_anomaly_events_unresolved').on(t.is_resolved),
  ],
);

export const alertChannels = pgTable(
  'alert_channels',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    channel_type: alertChannelType().notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull(),
    events: jsonb().$type<string[]>().notNull(),
    is_active: boolean().notNull().default(true),
    last_sent_at: ts(),
    created_at: createdAt(),
  },
  (t) => [index('idx_alert_channels_active').on(t.is_active)],
);

export const autoscaleRules = pgTable(
  'autoscale_rules',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    rule_name: varchar({ length: 100 }).notNull(),
    metric: autoscaleMetric().notNull(),
    scale_up_threshold: integer().notNull(),
    scale_down_threshold: integer().notNull(),
    min_devices: integer().notNull().default(1),
    max_devices: integer().notNull().default(10),
    cooldown_minutes: integer().notNull().default(5),
    is_active: boolean().notNull().default(true),
    last_action_at: ts(),
    last_action: varchar({ length: 20 }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_autoscale_rules_active').on(t.is_active)],
);

export const autoscaleHistory = pgTable(
  'autoscale_history',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    rule_id: integer()
      .notNull()
      .references(() => autoscaleRules.id, { onDelete: 'cascade' }),
    action: autoscaleAction().notNull(),
    device_id: varchar({ length: 255 }),
    metric_value: numeric({ precision: 10, scale: 2, mode: 'number' }).notNull(),
    threshold_value: integer().notNull(),
    active_device_count: integer().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
    created_at: createdAt(),
  },
  (t) => [index('idx_autoscale_history_rule').on(t.rule_id), index('idx_autoscale_history_created').on(t.created_at)],
);

export const systemStatus = pgTable('system_status', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  /** api | database | sms_sending | device_network */
  component: varchar({ length: 100 }).notNull().unique(),
  status: componentStatus().notNull().default('operational'),
  message: varchar({ length: 500 }),
  is_public: boolean().notNull().default(true),
  updated_by: varchar({ length: 100 }).notNull().default('system'),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const statusIncidents = pgTable(
  'status_incidents',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 200 }).notNull(),
    description: text(),
    severity: incidentSeverity().notNull().default('minor'),
    status: incidentStatus().notNull().default('investigating'),
    affected_components: jsonb().$type<string[]>(),
    resolved_at: ts(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index('idx_incidents_status').on(t.status), index('idx_incidents_created').on(t.created_at)],
);

export const apiVersions = pgTable('api_versions', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  version: varchar({ length: 10 }).notNull().unique(),
  is_active: boolean().notNull().default(true),
  is_default: boolean().notNull().default(false),
  deprecated_at: ts(),
  sunset_at: ts(),
  changelog: text(),
  created_at: createdAt(),
});

export const appProfiles = pgTable('app_profiles', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  profile_name: varchar({ length: 100 }).notNull(),
  api_url: varchar({ length: 500 }).notNull(),
  device_id: varchar({ length: 255 }),
  is_default: boolean().notNull().default(false),
  created_at: createdAt(),
});
