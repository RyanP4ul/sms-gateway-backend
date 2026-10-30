import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { autoscaleMetric } from '@/db';

export const AutoscaleModel = {
  createBody: t.Object({
    rule_name: t.String(),
    metric: enumOf(autoscaleMetric.enumValues),
    scale_up_threshold: t.Numeric(),
    scale_down_threshold: t.Numeric(),
    min_devices: t.Optional(t.Numeric()),
    max_devices: t.Optional(t.Numeric()),
    cooldown_minutes: t.Optional(t.Numeric()),
  }),
  toggleBody: t.Object({ id: t.Numeric() }),
  params: t.Object({ id: t.Numeric() }),
  historyQuery: t.Object({ limit: t.Optional(t.Numeric()) }),
} as const;

export type AutoscaleModel = { [k in keyof typeof AutoscaleModel]: UnwrapSchema<(typeof AutoscaleModel)[k]> };
