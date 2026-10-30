import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { SmsModel } from './model';
import { Sms } from './service';

export const smsModule = new Elysia({ prefix: '/sms', tags: ['SMS'] })
  .use(auth)
  .post('/send', ({ body, meta }) => Sms.send(body, meta), { admin: true, body: SmsModel.sendBody })
  .post('/bulk', ({ body, meta }) => Sms.bulk(body, meta), { admin: true, body: SmsModel.bulkBody })
  .post('/distribute', ({ body, meta }) => Sms.distribute(body, meta), { admin: true, body: SmsModel.distributeBody })
  .post('/distribute-weighted', ({ body, meta }) => Sms.distributeWeighted(body, meta), { admin: true, body: SmsModel.distributeWeightedBody })
  .post('/import-csv', ({ body, meta }) => Sms.importCsv(body, meta), { admin: true, body: SmsModel.importCsvBody })
  .get('/history', ({ query }) => Sms.history(query), { admin: true, query: SmsModel.historyQuery })
  .get('/:id', ({ params }) => Sms.getById(params.id), { admin: true, params: SmsModel.idParams });
