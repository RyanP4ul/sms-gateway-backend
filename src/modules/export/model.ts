import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';

export const ExportModel = {
  csvQuery: t.Object({
    type: t.Optional(enumOf(['sms', 'devices', 'audit'])),
    days: t.Optional(t.Numeric()),
    device_id: t.Optional(t.String()),
  }),
} as const;

export type ExportModel = { [k in keyof typeof ExportModel]: UnwrapSchema<(typeof ExportModel)[k]> };
