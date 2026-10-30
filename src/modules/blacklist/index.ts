import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { BlacklistModel } from './model';
import { Blacklist } from './service';

export const blacklistModule = new Elysia({ prefix: '/blacklist', tags: ['Blacklist'] })
  .use(auth)
  .get('/', () => Blacklist.list(), { admin: true })
  .post('/', ({ body, meta }) => Blacklist.add(body, meta), { admin: true, body: BlacklistModel.addBody })
  .delete('/:phone_number', ({ params, meta }) => Blacklist.remove(decodeURIComponent(params.phone_number), meta), {
    admin: true,
    params: BlacklistModel.params,
  });
