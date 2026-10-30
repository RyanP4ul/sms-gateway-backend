import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { AutoReplyModel } from './model';
import { AutoReply } from './service';

export const autoReplyModule = new Elysia({ prefix: '/auto-reply', tags: ['Auto reply'] })
  .use(auth)
  .get('/', () => AutoReply.list(), { admin: true })
  .post('/', ({ body }) => AutoReply.create(body), { admin: true, body: AutoReplyModel.createBody })
  .delete('/:id', ({ params }) => AutoReply.remove(params.id), { admin: true, params: AutoReplyModel.params });
