import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { matchType } from '@/db';

export const AutoReplyModel = {
  createBody: t.Object({
    keyword: t.String(),
    match_type: t.Optional(enumOf(matchType.enumValues)),
    reply_message: t.String(),
  }),
  params: t.Object({ id: t.Numeric() }),
} as const;

export type AutoReplyModel = { [k in keyof typeof AutoReplyModel]: UnwrapSchema<(typeof AutoReplyModel)[k]> };
