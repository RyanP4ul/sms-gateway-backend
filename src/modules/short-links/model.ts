import { t, type UnwrapSchema } from 'elysia';

export const ShortLinksModel = {
  createBody: t.Object({ url: t.String(), ttl_hours: t.Optional(t.Numeric()) }),
  params: t.Object({ code: t.String() }),
} as const;

export type ShortLinksModel = { [k in keyof typeof ShortLinksModel]: UnwrapSchema<(typeof ShortLinksModel)[k]> };
