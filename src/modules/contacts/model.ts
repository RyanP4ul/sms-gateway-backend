import { t, type UnwrapSchema } from 'elysia';
import { PaginationQuery } from '@/lib/pagination';

export const ContactsModel = {
  createBody: t.Object({
    name: t.String(),
    phone_number: t.Union([t.String(), t.Number()]),
    group_name: t.Optional(t.Nullable(t.String())),
  }),
  listQuery: t.Object({ ...PaginationQuery.properties, group: t.Optional(t.String()) }),
} as const;

export type ContactsModel = { [k in keyof typeof ContactsModel]: UnwrapSchema<(typeof ContactsModel)[k]> };
