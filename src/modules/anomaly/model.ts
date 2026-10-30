import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { anomalyActionType, anomalyRuleType } from '@/db';
import { PaginationQuery } from '@/lib/pagination';

export const AnomalyModel = {
  createRuleBody: t.Object({
    rule_name: t.String(),
    rule_type: enumOf(anomalyRuleType.enumValues),
    threshold_value: t.Numeric(),
    time_window_minutes: t.Optional(t.Numeric()),
    action_type: t.Optional(enumOf(anomalyActionType.enumValues)),
  }),
  eventsQuery: t.Object({ ...PaginationQuery.properties, unresolved: t.Optional(enumOf(['0', '1'])) }),
  resolveBody: t.Object({ event_id: t.Numeric() }),
} as const;

export type AnomalyModel = { [k in keyof typeof AnomalyModel]: UnwrapSchema<(typeof AnomalyModel)[k]> };
