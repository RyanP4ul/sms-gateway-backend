import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { ExportModel } from './model';
import { Export } from './service';

export const exportModule = new Elysia({ prefix: '/export', tags: ['Export'] })
  .use(auth)
  .get('/csv', ({ query }) => Export.csv(query), { admin: true, query: ExportModel.csvQuery });
