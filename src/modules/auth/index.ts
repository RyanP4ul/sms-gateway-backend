import { Elysia } from 'elysia';
import { auth as authPlugin } from '@/plugins/auth';

/** Used by the dashboard login to check an admin token before storing it. */
export const authModule = new Elysia({ prefix: '/auth', tags: ['Auth'] })
  .use(authPlugin)
  .get('/me', () => ({ success: true, role: 'admin' as const }), { admin: true });
