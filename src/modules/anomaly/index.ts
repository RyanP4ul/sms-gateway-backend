import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { AnomalyModel } from './model';
import { Anomaly } from './service';

export const anomalyModule = new Elysia({ prefix: '/anomaly', tags: ['Anomaly detection'] })
  .use(auth)
  .get('/rules', () => Anomaly.listRules(), { admin: true })
  .post('/rules', ({ body }) => Anomaly.createRule(body), { admin: true, body: AnomalyModel.createRuleBody })
  .get('/events', ({ query }) => Anomaly.listEvents(query), { admin: true, query: AnomalyModel.eventsQuery })
  .post('/events/resolve', ({ body }) => Anomaly.resolve(body), { admin: true, body: AnomalyModel.resolveBody });
