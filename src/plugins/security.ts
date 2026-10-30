import { cors } from "@elysia/cors";
import { Elysia } from "elysia";
import { env, isDev } from "@/lib/env";

/**
 * OWASP response headers + CORS (port of applySecurityHeaders() / handleCors()).
 * Docs UI (/openapi) is exempt from the strict CSP so it can render in development.
 */
export const security = new Elysia({ name: "security" })
  .use(
    cors({
      // Production with no configured origins → no CORS headers at all. Dev with none → allow any.
      origin: env.CORS_ALLOWED_ORIGINS.length
        ? env.CORS_ALLOWED_ORIGINS
        : isDev
          ? true
          : false,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "X-API-Key",
        "X-Admin-Token",
        "X-Registration-Secret",
      ],
      maxAge: 86_400,
    }),
  )
  .onRequest(({ request, set }) => {
    if (new URL(request.url).pathname.startsWith("/openapi")) return;
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["x-frame-options"] = "DENY";
    set.headers["referrer-policy"] = "strict-origin-when-cross-origin";
    set.headers["permissions-policy"] =
      "camera=(), microphone=(), geolocation=()";
    set.headers["strict-transport-security"] =
      "max-age=31536000; includeSubDomains; preload";
    set.headers["content-security-policy"] = "default-src 'none'";
    set.headers["cache-control"] = "no-store, no-cache, must-revalidate";
    set.headers["pragma"] = "no-cache";
  });
