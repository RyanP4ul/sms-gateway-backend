CREATE TYPE "audit_actor_type" AS ENUM('device', 'admin', 'system', 'anonymous');--> statement-breakpoint
CREATE TYPE "alert_channel_type" AS ENUM('email', 'sms', 'telegram', 'slack', 'webhook');--> statement-breakpoint
CREATE TYPE "anomaly_action_type" AS ENUM('alert', 'block_device', 'block_number', 'throttle');--> statement-breakpoint
CREATE TYPE "anomaly_rule_type" AS ENUM('spike', 'flood', 'night_activity', 'high_fail_rate', 'same_number');--> statement-breakpoint
CREATE TYPE "autoscale_action" AS ENUM('scale_up', 'scale_down');--> statement-breakpoint
CREATE TYPE "autoscale_metric" AS ENUM('queue_size', 'fail_rate', 'response_time', 'throughput');--> statement-breakpoint
CREATE TYPE "device_command_status" AS ENUM('pending', 'sent', 'executed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "device_command_type" AS ENUM('restart_service', 'sync_config', 'update_app', 'clear_queue', 'send_log', 'custom');--> statement-breakpoint
CREATE TYPE "component_status" AS ENUM('operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance');--> statement-breakpoint
CREATE TYPE "incident_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "auto_reply_match_type" AS ENUM('exact', 'contains', 'starts_with', 'regex');--> statement-breakpoint
CREATE TYPE "sms_status" AS ENUM('pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "uptime_check_type" AS ENUM('api', 'database', 'device');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('admin', 'user', 'viewer');--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(100) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'user'::"user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"api_token_hash" varchar(64),
	"api_token_prefix" varchar(8),
	"max_devices" integer DEFAULT 5 NOT NULL,
	"max_sms_per_day" integer DEFAULT 1000 NOT NULL,
	"last_login_at" timestamp with time zone,
	"totp_secret" varchar(64),
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"totp_recovery_codes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_key_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"device_id" varchar(255) NOT NULL,
	"api_key_hash" varchar(64) NOT NULL,
	"api_key_prefix" varchar(8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_commands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "device_commands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"device_id" varchar(255) NOT NULL,
	"command_type" "device_command_type" NOT NULL,
	"payload" jsonb,
	"status" "device_command_status" DEFAULT 'pending'::"device_command_status" NOT NULL,
	"result" jsonb,
	"created_by" varchar(100) DEFAULT 'admin' NOT NULL,
	"sent_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_score_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "device_score_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"device_id" varchar(255) NOT NULL,
	"score" smallint NOT NULL,
	"success_rate" numeric(5,2) NOT NULL,
	"avg_response_ms" integer,
	"uptime_pct" numeric(5,2) DEFAULT '100' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"device_id" varchar(255) NOT NULL UNIQUE,
	"device_name" varchar(255),
	"phone_number" varchar(20),
	"api_key_hash" varchar(64) NOT NULL,
	"api_key_prefix" varchar(8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_sms_per_minute" integer DEFAULT 10 NOT NULL,
	"sim_slot" smallint DEFAULT 0 NOT NULL,
	"last_seen" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"performance_score" smallint DEFAULT 100 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"cost_per_sms" numeric(10,4) DEFAULT '0' NOT NULL,
	"imei" varchar(20),
	"imei2" varchar(20),
	"android_version" varchar(20),
	"sdk_version" integer,
	"device_model" varchar(100),
	"device_brand" varchar(50),
	"device_manufacturer" varchar(50),
	"hardware_id" varchar(64),
	"board" varchar(50),
	"fingerprint" varchar(255),
	"display_resolution" varchar(20),
	"app_version" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_reply_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auto_reply_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"keyword" varchar(100) NOT NULL,
	"match_type" "auto_reply_match_type" DEFAULT 'contains'::"auto_reply_match_type" NOT NULL,
	"reply_message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"group_name" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incoming_sms" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "incoming_sms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"device_id" varchar(255) NOT NULL,
	"sender_number" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"auto_reply_sent" boolean DEFAULT false NOT NULL,
	"related_sms_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "otp_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"phone_number" varchar(20) NOT NULL,
	"code" varchar(10) NOT NULL,
	"purpose" varchar(50) DEFAULT 'verification' NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"sms_request_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_blacklist" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "phone_blacklist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"phone_number" varchar(20) NOT NULL UNIQUE,
	"reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "short_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"short_code" varchar(10) NOT NULL UNIQUE,
	"original_url" varchar(2000) NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"sms_request_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sms_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"device_id" varchar(255) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"status" "sms_status" DEFAULT 'pending'::"sms_status" NOT NULL,
	"priority" smallint DEFAULT 5 NOT NULL,
	"batch_id" varchar(36),
	"template_id" integer,
	"sim_slot" smallint DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"error_message" text,
	"retry_count" smallint DEFAULT 0 NOT NULL,
	"max_retries" smallint DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"webhook_url" varchar(500),
	"cost" numeric(10,4) DEFAULT '0' NOT NULL,
	"message_parts" smallint DEFAULT 1 NOT NULL,
	"encoding" varchar(10) DEFAULT 'gsm7' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_sms_priority" CHECK ("priority" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sms_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"variables" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_channels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_channels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"channel_type" "alert_channel_type" NOT NULL,
	"config" jsonb NOT NULL,
	"events" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "anomaly_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rule_id" integer NOT NULL,
	"device_id" varchar(255),
	"phone_number" varchar(20),
	"details" jsonb,
	"action_taken" varchar(50),
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "anomaly_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_name" varchar(100) NOT NULL,
	"rule_type" "anomaly_rule_type" NOT NULL,
	"threshold_value" integer NOT NULL,
	"time_window_minutes" integer DEFAULT 5 NOT NULL,
	"action_type" "anomaly_action_type" DEFAULT 'alert'::"anomaly_action_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version" varchar(10) NOT NULL UNIQUE,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"deprecated_at" timestamp with time zone,
	"sunset_at" timestamp with time zone,
	"changelog" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_name" varchar(100) NOT NULL,
	"api_url" varchar(500) NOT NULL,
	"device_id" varchar(255),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action" varchar(50) NOT NULL,
	"actor_type" "audit_actor_type" DEFAULT 'anonymous'::"audit_actor_type" NOT NULL,
	"actor_id" varchar(255),
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"request_method" varchar(10),
	"request_path" varchar(255),
	"response_code" smallint,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autoscale_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "autoscale_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_id" integer NOT NULL,
	"action" "autoscale_action" NOT NULL,
	"device_id" varchar(255),
	"metric_value" numeric(10,2) NOT NULL,
	"threshold_value" integer NOT NULL,
	"active_device_count" integer NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autoscale_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "autoscale_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_name" varchar(100) NOT NULL,
	"metric" "autoscale_metric" NOT NULL,
	"scale_up_threshold" integer NOT NULL,
	"scale_down_threshold" integer NOT NULL,
	"min_devices" integer DEFAULT 1 NOT NULL,
	"max_devices" integer DEFAULT 10 NOT NULL,
	"cooldown_minutes" integer DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_action_at" timestamp with time zone,
	"last_action" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"record_date" date NOT NULL,
	"device_id" varchar(255),
	"sms_count" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10,4) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'TRY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_cost_date_device" UNIQUE("record_date","device_id")
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_stats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"stat_date" date NOT NULL,
	"device_id" varchar(255),
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_pending" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_daily_date_device" UNIQUE("stat_date","device_id")
);
--> statement-breakpoint
CREATE TABLE "hourly_stats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hourly_stats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"stat_date" date NOT NULL,
	"stat_hour" smallint NOT NULL,
	"device_id" varchar(255),
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"avg_send_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_hourly_date_hour_device" UNIQUE("stat_date","stat_hour","device_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_limits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"identifier" varchar(255) NOT NULL,
	"endpoint" varchar(100) DEFAULT 'global' NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_rate_identifier_endpoint" UNIQUE("identifier","endpoint")
);
--> statement-breakpoint
CREATE TABLE "status_incidents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "status_incidents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(200) NOT NULL,
	"description" text,
	"severity" "incident_severity" DEFAULT 'minor'::"incident_severity" NOT NULL,
	"status" "incident_status" DEFAULT 'investigating'::"incident_status" NOT NULL,
	"affected_components" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_status" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "system_status_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"component" varchar(100) NOT NULL UNIQUE,
	"status" "component_status" DEFAULT 'operational'::"component_status" NOT NULL,
	"message" varchar(500),
	"is_public" boolean DEFAULT true NOT NULL,
	"updated_by" varchar(100) DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uptime_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"check_type" "uptime_check_type" NOT NULL,
	"target_id" varchar(255),
	"is_up" boolean DEFAULT true NOT NULL,
	"response_time_ms" integer,
	"error_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhooks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" varchar(500) NOT NULL,
	"events" jsonb NOT NULL,
	"secret" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" ("role");--> statement-breakpoint
CREATE INDEX "idx_users_token_hash" ON "users" ("api_token_hash");--> statement-breakpoint
CREATE INDEX "idx_akh_device" ON "api_key_history" ("device_id");--> statement-breakpoint
CREATE INDEX "idx_akh_hash" ON "api_key_history" ("api_key_hash");--> statement-breakpoint
CREATE INDEX "idx_akh_expires" ON "api_key_history" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_dc_device_status" ON "device_commands" ("device_id","status");--> statement-breakpoint
CREATE INDEX "idx_dc_status" ON "device_commands" ("status");--> statement-breakpoint
CREATE INDEX "idx_dc_expires" ON "device_commands" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_dsh_device_date" ON "device_score_history" ("device_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_devices_api_key_hash" ON "devices" ("api_key_hash");--> statement-breakpoint
CREATE INDEX "idx_devices_api_key_prefix" ON "devices" ("api_key_prefix");--> statement-breakpoint
CREATE INDEX "idx_devices_last_seen" ON "devices" ("last_seen");--> statement-breakpoint
CREATE INDEX "idx_devices_active_deleted" ON "devices" ("is_active","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_devices_weight" ON "devices" ("weight");--> statement-breakpoint
CREATE INDEX "idx_ar_keyword" ON "auto_reply_rules" ("keyword");--> statement-breakpoint
CREATE INDEX "idx_ar_active" ON "auto_reply_rules" ("is_active");--> statement-breakpoint
CREATE INDEX "idx_contacts_phone" ON "contacts" ("phone_number");--> statement-breakpoint
CREATE INDEX "idx_contacts_group" ON "contacts" ("group_name");--> statement-breakpoint
CREATE INDEX "idx_incoming_device_received" ON "incoming_sms" ("device_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_incoming_sender" ON "incoming_sms" ("sender_number");--> statement-breakpoint
CREATE INDEX "idx_incoming_unread" ON "incoming_sms" ("is_read");--> statement-breakpoint
CREATE INDEX "idx_otp_phone_purpose" ON "otp_codes" ("phone_number","purpose");--> statement-breakpoint
CREATE INDEX "idx_otp_code" ON "otp_codes" ("code");--> statement-breakpoint
CREATE INDEX "idx_otp_expires" ON "otp_codes" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sl_expires" ON "short_links" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sms_device_status" ON "sms_requests" ("device_id","status");--> statement-breakpoint
CREATE INDEX "idx_sms_status_priority" ON "sms_requests" ("status","priority" DESC NULLS LAST,"created_at");--> statement-breakpoint
CREATE INDEX "idx_sms_scheduled" ON "sms_requests" ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_sms_retry" ON "sms_requests" ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_sms_batch" ON "sms_requests" ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_sms_created" ON "sms_requests" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sms_phone" ON "sms_requests" ("phone_number");--> statement-breakpoint
CREATE INDEX "idx_tpl_name" ON "sms_templates" ("name");--> statement-breakpoint
CREATE INDEX "idx_tpl_active" ON "sms_templates" ("is_active");--> statement-breakpoint
CREATE INDEX "idx_alert_channels_active" ON "alert_channels" ("is_active");--> statement-breakpoint
CREATE INDEX "idx_anomaly_events_rule" ON "anomaly_events" ("rule_id");--> statement-breakpoint
CREATE INDEX "idx_anomaly_events_created" ON "anomaly_events" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_anomaly_events_unresolved" ON "anomaly_events" ("is_resolved");--> statement-breakpoint
CREATE INDEX "idx_anomaly_rules_active" ON "anomaly_rules" ("is_active");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_logs" ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_ip" ON "audit_logs" ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_autoscale_history_rule" ON "autoscale_history" ("rule_id");--> statement-breakpoint
CREATE INDEX "idx_autoscale_history_created" ON "autoscale_history" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_autoscale_rules_active" ON "autoscale_rules" ("is_active");--> statement-breakpoint
CREATE INDEX "idx_hourly_date" ON "hourly_stats" ("stat_date");--> statement-breakpoint
CREATE INDEX "idx_rate_window" ON "rate_limits" ("window_start");--> statement-breakpoint
CREATE INDEX "idx_incidents_status" ON "status_incidents" ("status");--> statement-breakpoint
CREATE INDEX "idx_incidents_created" ON "status_incidents" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_uptime_type_target" ON "uptime_checks" ("check_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_uptime_created" ON "uptime_checks" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_webhooks_active" ON "webhooks" ("is_active");--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_id_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "incoming_sms" ADD CONSTRAINT "incoming_sms_device_id_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sms_requests" ADD CONSTRAINT "sms_requests_device_id_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_rule_id_anomaly_rules_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "anomaly_rules"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "autoscale_history" ADD CONSTRAINT "autoscale_history_rule_id_autoscale_rules_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "autoscale_rules"("id") ON DELETE CASCADE;