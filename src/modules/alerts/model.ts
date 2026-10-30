import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { alertChannelType } from '@/db';

export const AlertsModel = {
  createBody: t.Object({
    channel_type: enumOf(alertChannelType.enumValues),
    config: t.Record(t.String(), t.Any()),
    events: t.Array(t.String(), { minItems: 1 }),
  }),
  params: t.Object({ id: t.Numeric() }),
} as const;

export type AlertsModel = { [k in keyof typeof AlertsModel]: UnwrapSchema<(typeof AlertsModel)[k]> };
