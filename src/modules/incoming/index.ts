import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { IncomingModel } from './model';
import { Incoming } from './service';

export const incomingModule = new Elysia({ prefix: '/incoming', tags: ['Incoming SMS'] })
  .use(auth)
  .get('/', ({ query }) => Incoming.list(query), { admin: true, query: IncomingModel.listQuery })
  .post('/read', ({ body }) => Incoming.markRead(body), { admin: true, body: IncomingModel.markReadBody });
