import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { CommandsModel } from '../commands/model';
import { Commands } from '../commands/service';
import { IncomingModel } from '../incoming/model';
import { Incoming } from '../incoming/service';
import { SmsModel } from '../sms/model';
import { Sms } from '../sms/service';

/**
 * Everything the Android client calls, authenticated with X-API-Key.
 * (Registration is POST /devices/register because it uses the registration secret instead.)
 */
export const gatewayModule = new Elysia({ prefix: '/gateway', tags: ['Gateway (device API)'] })
  .use(auth)
  .get('/pending', ({ device }) => Sms.pending(device.id), { device: true })
  .post('/status', ({ device, body, meta }) => Sms.updateStatus(device.id, body, meta), { device: true, body: SmsModel.updateStatusBody })
  .post('/incoming', ({ device, body }) => Incoming.report(device.id, body), { device: true, body: IncomingModel.reportBody })
  .post('/sms', ({ device, body, meta }) => Sms.manual(device.id, body, meta), { device: true, body: SmsModel.manualBody })
  .get('/commands', ({ device }) => Commands.poll(device.id), { device: true })
  .post('/commands/result', ({ device, body }) => Commands.reportResult(device.id, body), { device: true, body: CommandsModel.resultBody });
