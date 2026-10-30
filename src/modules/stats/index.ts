import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { StatsModel } from './model';
import { Stats } from './service';

export const statsModule = new Elysia({ prefix: '/stats', tags: ['Stats'] })
  .use(auth)
  .get('/', () => Stats.overview(), { admin: true })
  .get('/heatmap', ({ query }) => Stats.heatmap(query), { admin: true, query: StatsModel.heatmapQuery })
  .get('/uptime', () => Stats.uptime(), { admin: true })
  .get('/queue', () => Stats.queue(), { admin: true })
  .get('/stream', ({ request }) => Stats.dashboardStream(request.signal), { admin: true })
  .get('/queue/live', ({ request }) => Stats.queueStream(request.signal), { admin: true });
