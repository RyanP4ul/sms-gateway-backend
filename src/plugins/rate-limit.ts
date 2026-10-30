import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '@/db';
import { env } from '@/lib/env';
import { getClientIp } from '@/lib/request';
import { Audit } from '@/modules/audit/service';
import { getRequestMeta } from '@/lib/request';

export type RateLimitResult = { allowed: boolean; limit: number; remaining: number; retryAfter: number; count: number };

/**
 * Fixed-window limiter backed by Postgres (port of checkRateLimit()).
 * One atomic upsert per hit instead of delete + select + update, so concurrent
 * requests can no longer slip past the limit.
 */
export abstract class RateLimit {
  static async hit(identifier: string, endpoint = 'global'): Promise<RateLimitResult> {
    const limit = env.RATE_LIMIT_REQUESTS;
    const windowSeconds = env.RATE_LIMIT_WINDOW;
    try {
      const rows = await db.execute<{ request_count: number; elapsed: number }>(sql`
        insert into rate_limits (identifier, endpoint, request_count, window_start)
        values (${identifier}, ${endpoint}, 1, now())
        on conflict (identifier, endpoint) do update set
          request_count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::double precision)
                               then 1 else rate_limits.request_count + 1 end,
          window_start  = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::double precision)
                               then now() else rate_limits.window_start end
        returning request_count, extract(epoch from (now() - window_start))::float8 as elapsed`);
      const { request_count: count, elapsed } = rows[0]!;
      return {
        allowed: count <= limit,
        limit,
        count,
        remaining: Math.max(0, limit - count),
        retryAfter: Math.max(1, Math.ceil(windowSeconds - elapsed)),
      };
    } catch (error) {
      // Fail open for availability, like the original.
      console.error('Rate limit error:', error);
      return { allowed: true, limit, count: 0, remaining: limit, retryAfter: 1 };
    }
  }
}

/** Global limiter: runs on every request (before routing), keyed by client IP. */
export const rateLimit = new Elysia({ name: 'rate-limit' }).onRequest(async ({ request, server, set, status }) => {
  if (request.method === 'OPTIONS') return;
  const { pathname } = new URL(request.url);
  if (pathname === '/health' || pathname.startsWith('/openapi')) return;

  const ip = getClientIp(request, server);
  const result = await RateLimit.hit(ip);
  set.headers['x-ratelimit-limit'] = String(result.limit);
  set.headers['x-ratelimit-remaining'] = String(result.remaining);

  if (!result.allowed) {
    set.headers['retry-after'] = String(result.retryAfter);
    // Log once per window instead of once per blocked request (avoids write amplification under flood).
    if (result.count === result.limit + 1) {
      void Audit.log({ action: 'rate_limit.exceeded', actorType: 'anonymous', meta: getRequestMeta(request, server) });
    }
    return status(429, { error: 'Too many requests, please wait' });
  }
});

