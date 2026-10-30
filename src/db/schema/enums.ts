import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'user', 'viewer']);
export const smsStatus = pgEnum('sms_status', ['pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled']);
export const actorType = pgEnum('audit_actor_type', ['device', 'admin', 'system', 'anonymous']);
export const matchType = pgEnum('auto_reply_match_type', ['exact', 'contains', 'starts_with', 'regex']);
export const anomalyRuleType = pgEnum('anomaly_rule_type', ['spike', 'flood', 'night_activity', 'high_fail_rate', 'same_number']);
export const anomalyActionType = pgEnum('anomaly_action_type', ['alert', 'block_device', 'block_number', 'throttle']);
export const alertChannelType = pgEnum('alert_channel_type', ['email', 'sms', 'telegram', 'slack', 'webhook']);
export const commandType = pgEnum('device_command_type', ['restart_service', 'sync_config', 'update_app', 'clear_queue', 'send_log', 'custom']);
export const commandStatus = pgEnum('device_command_status', ['pending', 'sent', 'executed', 'failed', 'expired']);
export const autoscaleMetric = pgEnum('autoscale_metric', ['queue_size', 'fail_rate', 'response_time', 'throughput']);
export const autoscaleAction = pgEnum('autoscale_action', ['scale_up', 'scale_down']);
export const componentStatus = pgEnum('component_status', ['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance']);
export const incidentSeverity = pgEnum('incident_severity', ['minor', 'major', 'critical']);
export const incidentStatus = pgEnum('incident_status', ['investigating', 'identified', 'monitoring', 'resolved']);
export const uptimeCheckType = pgEnum('uptime_check_type', ['api', 'database', 'device']);
