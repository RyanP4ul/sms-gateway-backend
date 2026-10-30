import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { ShortLinksModel } from './model';
import { ShortLinks } from './service';

export const shortLinksModule = new Elysia({ prefix: '/short-links', tags: ['Short links'] })
  .use(auth)
  .get('/', () => ShortLinks.list(), { admin: true })
  .post('/', ({ body }) => ShortLinks.create(body), { admin: true, body: ShortLinksModel.createBody });

/** Public redirect: GET /r/:code */
export const redirectModule = new Elysia({ tags: ['Short links'] }).get(
  '/r/:code',
  async ({ params, redirect }) => {
    const result = await ShortLinks.resolve(params.code);
    return 'url' in result ? redirect(result.url, 302) : result;
  },
  { params: ShortLinksModel.params },
);
