import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { StatusModel } from './model';
import { SystemStatus } from './service';

export const statusModule = new Elysia({ prefix: '/status', tags: ['Status page'] })
  .use(auth)
  // Public — consumed by the /status page
  .get('/public', () => SystemStatus.publicStatus())
  // Admin
  .get('/', () => SystemStatus.adminOverview(), { admin: true })
  .post('/components', ({ body, meta }) => SystemStatus.updateComponent(body, meta), { admin: true, body: StatusModel.componentBody })
  .get('/incidents', ({ query }) => SystemStatus.listIncidents(query), { admin: true, query: StatusModel.incidentsQuery })
  .post('/incidents', ({ body, meta }) => SystemStatus.createIncident(body, meta), { admin: true, body: StatusModel.createIncidentBody })
  .post('/incidents/update', ({ body, meta }) => SystemStatus.updateIncident(body, meta), { admin: true, body: StatusModel.updateIncidentBody });
