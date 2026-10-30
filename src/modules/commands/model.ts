import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { commandStatus, commandType } from '@/db';

export const CommandsModel = {
  createBody: t.Object({
    device_id: t.String(),
    command_type: enumOf(commandType.enumValues),
    payload: t.Optional(t.Any()),
    expires_minutes: t.Optional(t.Numeric()),
  }),
  listQuery: t.Object({
    device_id: t.Optional(t.String()),
    status: t.Optional(enumOf(commandStatus.enumValues)),
    limit: t.Optional(t.Numeric()),
  }),
  /** Device reports the outcome of a polled command */
  resultBody: t.Object({
    command_id: t.Numeric(),
    success: t.Optional(t.Boolean()),
    result: t.Optional(t.Any()),
  }),
} as const;

export type CommandsModel = { [k in keyof typeof CommandsModel]: UnwrapSchema<(typeof CommandsModel)[k]> };
