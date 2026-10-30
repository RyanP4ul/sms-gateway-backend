import { t, type UnwrapSchema } from 'elysia';

export const WEBHOOK_EVENTS = ['sms.sent', 'sms.failed', 'sms.delivered', 'sms.incoming', 'device.offline', 'device.registered'] as const;

export const WebhooksModel = {
  createBody: t.Object({
    url: t.String(),
    events: t.Array(t.String(), { minItems: 1 }),
  }),
} as const;

export type WebhooksModel = { [k in keyof typeof WebhooksModel]: UnwrapSchema<(typeof WebhooksModel)[k]> };
