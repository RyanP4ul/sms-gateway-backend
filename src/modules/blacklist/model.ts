import { t, type UnwrapSchema } from 'elysia';

export const BlacklistModel = {
  addBody: t.Object({ phone_number: t.Union([t.String(), t.Number()]), reason: t.Optional(t.String()) }),
  params: t.Object({ phone_number: t.String() }),
} as const;

export type BlacklistModel = { [k in keyof typeof BlacklistModel]: UnwrapSchema<(typeof BlacklistModel)[k]> };
