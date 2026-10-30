import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { TemplatesModel } from './model';
import { Templates } from './service';

export const templatesModule = new Elysia({ prefix: '/templates', tags: ['Templates'] })
  .use(auth)
  .get('/', () => Templates.list(), { admin: true })
  .post('/', ({ body }) => Templates.create(body), { admin: true, body: TemplatesModel.createBody });
