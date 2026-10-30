import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { OtpModel } from './model';
import { Otp } from './service';

export const otpModule = new Elysia({ prefix: '/otp', tags: ['OTP'] })
  .use(auth)
  .post('/send', ({ body, meta }) => Otp.send(body, meta), { admin: true, body: OtpModel.sendBody })
  .post('/verify', ({ body }) => Otp.verify(body), { admin: true, body: OtpModel.verifyBody });
