import { Elysia } from 'elysia';
import { getRequestMeta } from '@/lib/request';

/** Request-dependent data (client IP, UA, path) derived once per request and handed to services explicitly. */
export const requestContext = new Elysia({ name: 'request-context' }).derive({ as: 'global' }, ({ request, server }) => ({
  meta: getRequestMeta(request, server),
}));
