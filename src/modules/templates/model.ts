import { t, type UnwrapSchema } from 'elysia';

export const TemplatesModel = {
  createBody: t.Object({
    name: t.String(),
    content: t.String(),
    variables: t.Optional(t.Array(t.String())),
  }),
} as const;

export type TemplatesModel = { [k in keyof typeof TemplatesModel]: UnwrapSchema<(typeof TemplatesModel)[k]> };
