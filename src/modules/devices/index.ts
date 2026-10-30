import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { RateLimit } from '@/plugins/rate-limit';
import { DevicesModel } from './model';
import { Devices } from './service';

export const devicesModule = new Elysia({ prefix: '/devices', tags: ['Devices'] })
  .use(auth)
  // Public (registration secret). Extra per-IP bucket to slow brute-forcing of the secret.
  .post(
    '/register',
    async ({ body, meta, status }) => {
      const limit = await RateLimit.hit(meta.ip, 'register');
      if (!limit.allowed) return status(429, { error: 'Too many registration attempts' });
      return Devices.register(body, meta);
    },
    { registration: true, body: DevicesModel.registerBody },
  )
  .get('/', () => Devices.list(), { admin: true })
  .get('/health', () => Devices.health(), { admin: true })
  .get('/scores', () => Devices.scores(), { admin: true })
  .get('/key-history', ({ query }) => Devices.keyHistory(query), { admin: true, query: DevicesModel.keyHistoryQuery })
  .post('/toggle', ({ body, meta }) => Devices.toggle(body, meta), { admin: true, body: DevicesModel.toggleBody })
  .post('/cost', ({ body }) => Devices.updateCost(body), { admin: true, body: DevicesModel.costBody })
  .post('/weight', ({ body }) => Devices.updateWeight(body), { admin: true, body: DevicesModel.weightBody })
  .post('/rotate-key', ({ body, meta }) => Devices.rotateKey(body, meta), { admin: true, body: DevicesModel.rotateBody })
  .delete('/:device_id', ({ params, meta }) => Devices.remove(params.device_id, meta), { admin: true, params: DevicesModel.params });

