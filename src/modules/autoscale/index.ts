import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { AutoscaleModel } from './model';
import { Autoscale } from './service';

export const autoscaleModule = new Elysia({ prefix: '/autoscale', tags: ['Autoscaling'] })
  .use(auth)
  .get('/rules', () => Autoscale.list(), { admin: true })
  .post('/rules', ({ body, meta }) => Autoscale.create(body, meta), { admin: true, body: AutoscaleModel.createBody })
  .delete('/rules/:id', ({ params, meta }) => Autoscale.remove(params.id, meta), { admin: true, params: AutoscaleModel.params })
  .post('/toggle', ({ body, meta }) => Autoscale.toggle(body, meta), { admin: true, body: AutoscaleModel.toggleBody })
  .get('/history', ({ query }) => Autoscale.history(query), { admin: true, query: AutoscaleModel.historyQuery });
