import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { AlertsModel } from './model';
import { Alerts } from './service';

export const alertsModule = new Elysia({ prefix: '/alerts', tags: ['Alerts'] })
  .use(auth)
  .get('/channels', () => Alerts.list(), { admin: true })
  .post('/channels', ({ body }) => Alerts.create(body), { admin: true, body: AlertsModel.createBody })
  .delete('/channels/:id', ({ params }) => Alerts.remove(params.id), { admin: true, params: AlertsModel.params });
