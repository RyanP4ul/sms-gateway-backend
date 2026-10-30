import { app } from './app';
import { env } from './lib/env';

if (!env.ADMIN_TOKEN) console.warn('⚠  ADMIN_TOKEN is not set — every admin endpoint will answer 500 until you configure it.');
if (!env.REGISTRATION_SECRET) console.warn('⚠  REGISTRATION_SECRET is not set — anyone who can reach POST /devices/register can enrol (or re-key) a device.');
if (env.APP_ENV === 'production' && !env.TRUST_PROXY) console.warn('ℹ  TRUST_PROXY=false: rate limits use the socket IP. Set TRUST_PROXY=true when running behind a reverse proxy / the Next.js proxy.');

app.listen({ port: env.PORT, hostname: env.HOST, maxRequestBodySize: 1_048_576 }, ({ hostname, port }) => {
  console.log(`🦊 SMS Gateway API listening on http://${hostname}:${port}  (cron ${env.CRON_ENABLED ? 'on' : 'off'})`);
});
