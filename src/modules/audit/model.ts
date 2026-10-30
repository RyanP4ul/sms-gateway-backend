import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { actorType } from '@/db';
import { PaginationQuery } from '@/lib/pagination';

export const AuditModel = {
  listQuery: t.Object({
    ...PaginationQuery.properties,
    action: t.Optional(t.String()),
    actor_type: t.Optional(enumOf(actorType.enumValues)),
  }),
} as const;

export type AuditModel = { [k in keyof typeof AuditModel]: UnwrapSchema<(typeof AuditModel)[k]> };
