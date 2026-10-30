// import { openapi } from '@elysiajs/openapi';
import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { env, isDev } from "@/lib/env";
import { alertsModule } from "@/modules/alerts";
import { anomalyModule } from "@/modules/anomaly";
import { apiVersionsModule } from "@/modules/api-versions";
import { auditModule } from "@/modules/audit";
import { authModule } from "@/modules/auth";
import { autoReplyModule } from "@/modules/auto-reply";
import { autoscaleModule } from "@/modules/autoscale";
import { blacklistModule } from "@/modules/blacklist";
import { commandsModule } from "@/modules/commands";
import { contactsModule } from "@/modules/contacts";
import { costsModule } from "@/modules/costs";
import { cronModule } from "@/modules/cron";
import { devicesModule } from "@/modules/devices";
import { exportModule } from "@/modules/export";
import { gatewayModule } from "@/modules/gateway";
import { incomingModule } from "@/modules/incoming";
import { otpModule } from "@/modules/otp";
import { redirectModule, shortLinksModule } from "@/modules/short-links";
import { smsModule } from "@/modules/sms";
import { statsModule } from "@/modules/stats";
import { statusModule } from "@/modules/status";
import { templatesModule } from "@/modules/templates";
import { webhooksModule } from "@/modules/webhooks";
import { errors } from "@/plugins/errors";
import { rateLimit } from "@/plugins/rate-limit";
import { security } from "@/plugins/security";

export const app = new Elysia({ name: "sms-gateway" })
  .use(security)
  .use(rateLimit)
  .use(errors)
  // .use(
  //   isDev
  //     ? openapi({
  //         path: '/openapi',
  //         documentation: {
  //           info: { title: 'SMS Gateway API', version: '4.0.0' },
  //           components: {
  //             securitySchemes: {
  //               adminToken: { type: 'apiKey', in: 'header', name: 'X-Admin-Token' },
  //               deviceKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
  //             },
  //           },
  //         },
  //       })
  //     : new Elysia(),
  // )
  .get("/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok", env: env.APP_ENV };
  })
  .use(authModule)
  .use(devicesModule)
  .use(gatewayModule)
  .use(smsModule)
  .use(templatesModule)
  .use(webhooksModule)
  .use(contactsModule)
  .use(blacklistModule)
  .use(incomingModule)
  .use(autoReplyModule)
  .use(otpModule)
  .use(shortLinksModule)
  .use(redirectModule)
  .use(anomalyModule)
  .use(alertsModule)
  .use(costsModule)
  .use(statsModule)
  .use(exportModule)
  .use(auditModule)
  .use(commandsModule)
  .use(autoscaleModule)
  .use(statusModule)
  .use(apiVersionsModule)
  .use(cronModule);

export type App = typeof app;
