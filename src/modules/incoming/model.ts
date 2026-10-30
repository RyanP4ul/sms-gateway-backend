import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { PaginationQuery } from '@/lib/pagination';

export const IncomingModel = {
  /** Sent by the Android client when an SMS arrives */
  reportBody: t.Object({ sender_number: t.Union([t.String(), t.Number()]), message: t.String() }),
  listQuery: t.Object({
    ...PaginationQuery.properties,
    device_id: t.Optional(t.String()),
    is_read: t.Optional(enumOf(['0', '1'])),
  }),
  markReadBody: t.Object({ ids: t.Array(t.Numeric(), { minItems: 1, maxItems: 500 }) }),
} as const;

export type IncomingModel = { [k in keyof typeof IncomingModel]: UnwrapSchema<(typeof IncomingModel)[k]> };
