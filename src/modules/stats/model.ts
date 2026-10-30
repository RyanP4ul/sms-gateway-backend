import { t, type UnwrapSchema } from 'elysia';

export const StatsModel = {
  heatmapQuery: t.Object({ days: t.Optional(t.Numeric()) }),
} as const;

export type StatsModel = { [k in keyof typeof StatsModel]: UnwrapSchema<(typeof StatsModel)[k]> };
