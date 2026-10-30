import { Elysia } from "elysia";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { Audit } from "@/modules/audit/service";
import { Devices } from "@/modules/devices/service";
import { requestContext } from "./request-context";

/**
 * Request-dependent auth as a named Elysia plugin (singleton thanks to `name`).
 *
 *  - `admin: true`        → X-Admin-Token header (constant-time compare)
 *  - `device: true`       → X-API-Key header; resolves `device.id`
 *  - `registration: true` → X-Registration-Secret header or `registration_secret` body field
 *
 * In the PHP version several handlers called authenticateAdmin() without checking
 * its result (device-command, queue-stats, autoscale-*, status-*, …), leaving them open.
 * With a macro, a route is either protected or visibly isn't.
 */
export const auth = new Elysia({ name: "auth" }).use(requestContext).macro({
  admin: {
    async beforeHandle({ headers, meta, status }) {
      if (!env.ADMIN_TOKEN)
        return status(500, {
          error: "Admin token not configured",
          code: 500,
        });
      console.log("Admin token:", env.ADMIN_TOKEN);
      const token = headers["x-admin-token"] ?? "";
      if (!token)
        return status(401, { error: "Admin token required", code: 401 });
      if (!safeEqual(env.ADMIN_TOKEN, token)) {
        await Audit.log({
          action: "auth.admin_failed",
          details: { reason: "invalid_token" },
          meta,
        });
        return status(401, { error: "Invalid admin token", code: 401 });
      }
    },
  },
  device: {
    async resolve({ headers, status }) {
      const result = await Devices.authenticate(headers["x-api-key"]);
      if ("error" in result)
        return status(result.code, { error: result.error, code: result.code });
      return { device: { id: result.device_id } };
    },
  },
  registration: {
    async beforeHandle({ headers, body, meta, status }) {
      // No secret configured → registration stays open (backwards compatible). A startup warning is logged.
      if (!env.REGISTRATION_SECRET) return;
      const fromBody = (body as { registration_secret?: unknown } | undefined)
        ?.registration_secret;
      const secret =
        headers["x-registration-secret"] ??
        (typeof fromBody === "string" ? fromBody : "");
      if (!secret)
        return status(401, { error: "Registration key required", code: 401 });
      if (!safeEqual(env.REGISTRATION_SECRET, secret)) {
        await Audit.log({
          action: "auth.registration_failed",
          details: { reason: "invalid_secret" },
          meta,
        });
        return status(401, { error: "Invalid registration key", code: 401 });
      }
    },
  },
});

