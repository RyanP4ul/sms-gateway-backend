import { t, type UnwrapSchema } from 'elysia';

export const DevicesModel = {
  registerBody: t.Object({
    device_id: t.String(),
    device_name: t.Optional(t.String()),
    phone_number: t.Optional(t.String()),
    /** Alternative to the X-Registration-Secret header */
    registration_secret: t.Optional(t.String()),
    device_info: t.Optional(t.Record(t.String(), t.Any())),
  }),
  toggleBody: t.Object({
    device_id: t.String(),
    /** Omit to flip the current state */
    is_active: t.Optional(t.Union([t.Boolean(), t.Number()])),
  }),
  costBody: t.Object({ device_id: t.String(), cost_per_sms: t.Numeric() }),
  weightBody: t.Object({ device_id: t.String(), weight: t.Numeric() }),
  rotateBody: t.Object({ device_id: t.String() }),
  params: t.Object({ device_id: t.String() }),
  keyHistoryQuery: t.Object({ device_id: t.Optional(t.String()) }),
} as const;

export type DevicesModel = { [k in keyof typeof DevicesModel]: UnwrapSchema<(typeof DevicesModel)[k]> };
