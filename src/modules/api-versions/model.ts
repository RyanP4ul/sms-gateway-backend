import { t, type UnwrapSchema } from 'elysia';

export const ApiVersionsModel = {
  upsertBody: t.Object({
    version: t.String(),
    is_active: t.Optional(t.Union([t.Boolean(), t.Number()])),
    is_default: t.Optional(t.Union([t.Boolean(), t.Number()])),
    changelog: t.Optional(t.String()),
    deprecated_at: t.Optional(t.Nullable(t.String())),
    sunset_at: t.Optional(t.Nullable(t.String())),
  }),
} as const;

export type ApiVersionsModel = { [k in keyof typeof ApiVersionsModel]: UnwrapSchema<(typeof ApiVersionsModel)[k]> };
