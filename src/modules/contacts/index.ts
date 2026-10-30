import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { ContactsModel } from './model';
import { Contacts } from './service';

export const contactsModule = new Elysia({ prefix: '/contacts', tags: ['Contacts'] })
  .use(auth)
  .get('/', ({ query }) => Contacts.list(query), { admin: true, query: ContactsModel.listQuery })
  .post('/', ({ body }) => Contacts.create(body), { admin: true, body: ContactsModel.createBody });
