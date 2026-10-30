import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { smsStatus } from '@/db';
import { PaginationQuery } from '@/lib/pagination';

/** Phone numbers may arrive as strings or numbers from older clients. */
const Phone = t.Union([t.String(), t.Number()]);
const Variables = t.Optional(t.Record(t.String(), t.Any()));

const distributeFields = {
  device_ids: t.Array(t.String(), { minItems: 1 }),
  /** One per line / comma / semicolon separated string, or an array */
  phone_numbers: t.Union([t.String(), t.Array(Phone)]),
  message: t.Optional(t.String()),
  template_id: t.Optional(t.Numeric()),
  variables: Variables,
  priority: t.Optional(t.Numeric()),
};

export const SmsModel = {
  sendBody: t.Object({
    device_id: t.String(),
    phone_number: Phone,
    message: t.Optional(t.String()),
    priority: t.Optional(t.Numeric()),
    sim_slot: t.Optional(t.Numeric()),
    scheduled_at: t.Optional(t.String()),
    webhook_url: t.Optional(t.String()),
    template_id: t.Optional(t.Numeric()),
    variables: Variables,
  }),
  bulkBody: t.Object({
    device_id: t.String(),
    messages: t.Array(t.Partial(t.Object({ phone_number: Phone, message: t.String(), priority: t.Numeric() }))),
  }),
  distributeBody: t.Object(distributeFields),
  distributeWeightedBody: t.Object({
    ...distributeFields,
    strategy: t.Optional(enumOf(['weighted', 'performance', 'cost'])),
  }),
  importCsvBody: t.Object({
    device_id: t.String(),
    csv_data: t.String(),
    message: t.Optional(t.String()),
    template_id: t.Optional(t.Numeric()),
    priority: t.Optional(t.Numeric()),
  }),
  historyQuery: t.Object({
    ...PaginationQuery.properties,
    device_id: t.Optional(t.String()),
    status: t.Optional(enumOf(smsStatus.enumValues)),
    batch_id: t.Optional(t.String()),
  }),
  idParams: t.Object({ id: t.Numeric() }),

  // Device-facing (gateway)
  updateStatusBody: t.Object({
    request_id: t.Numeric(),
    status: t.String(),
    error_message: t.Optional(t.Nullable(t.String())),
  }),
  manualBody: t.Object({ phone_number: Phone, message: t.String() }),
} as const;

export type SmsModel = { [k in keyof typeof SmsModel]: UnwrapSchema<(typeof SmsModel)[k]> };
