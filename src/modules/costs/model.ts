import { t, type UnwrapSchema } from 'elysia';

export const CostsModel = {
  reportQuery: t.Object({ days: t.Optional(t.Numeric()), device_id: t.Optional(t.String()) }),
} as const;

export type CostsModel = { [k in keyof typeof CostsModel]: UnwrapSchema<(typeof CostsModel)[k]> };
