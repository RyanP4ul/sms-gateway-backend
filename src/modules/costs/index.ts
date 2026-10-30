import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { CostsModel } from './model';
import { Costs } from './service';

/** Per-device price is edited via POST /devices/cost. */
export const costsModule = new Elysia({ prefix: '/costs', tags: ['Costs'] })
  .use(auth)
  .get('/', ({ query }) => Costs.report(query), { admin: true, query: CostsModel.reportQuery });
