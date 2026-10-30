import { t, type UnwrapSchema } from 'elysia';

const Phone = t.Union([t.String(), t.Number()]);

export const OtpModel = {
  sendBody: t.Object({
    phone_number: Phone,
    device_id: t.String(),
    purpose: t.Optional(t.String()),
    length: t.Optional(t.Numeric()),
    ttl_seconds: t.Optional(t.Numeric()),
    /** Use `{{code}}` as the placeholder */
    message_template: t.Optional(t.String()),
  }),
  verifyBody: t.Object({ phone_number: Phone, code: t.Union([t.String(), t.Number()]), purpose: t.Optional(t.String()) }),
} as const;

export type OtpModel = { [k in keyof typeof OtpModel]: UnwrapSchema<(typeof OtpModel)[k]> };
