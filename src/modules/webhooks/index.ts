import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { WebhooksModel } from './model';
import { Webhooks } from './service';

export const webhooksModule = new Elysia({ prefix: '/webhooks', tags: ['Webhooks'] })
  .use(auth)
  .get('/', () => Webhooks.list(), { admin: true })
  .post('/', ({ body }) => Webhooks.create(body), { admin: true, body: WebhooksModel.createBody });
