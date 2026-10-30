import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { CommandsModel } from './model';
import { Commands } from './service';

/** Admin side of remote commands. The device side (poll / result) lives in the gateway module. */
export const commandsModule = new Elysia({ prefix: '/commands', tags: ['Remote commands'] })
  .use(auth)
  .get('/', ({ query }) => Commands.list(query), { admin: true, query: CommandsModel.listQuery })
  .post('/', ({ body, meta }) => Commands.create(body, meta), { admin: true, body: CommandsModel.createBody });
