import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { ApiVersionsModel } from './model';
import { ApiVersions } from './service';

export const apiVersionsModule = new Elysia({ prefix: '/api-versions', tags: ['API versions'] })
  .use(auth)
  .get('/', () => ApiVersions.list(), { admin: true })
  .post('/', ({ body, meta }) => ApiVersions.upsert(body, meta), { admin: true, body: ApiVersionsModel.upsertBody });
