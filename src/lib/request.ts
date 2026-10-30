import { isIP } from 'node:net';
import { env } from './env';

export type RequestMeta = {
  ip: string;
  userAgent: string;
  method: string;
  path: string;
};

type ServerLike = { requestIP(req: Request): { address: string } | null } | null;

/**
 * Client IP. Forwarding headers are only honoured when TRUST_PROXY=true —
 * the PHP version trusted them unconditionally, which let anyone spoof an IP
 * to dodge rate limiting.
 */
export function getClientIp(request: Request, server: ServerLike): string {
  if (env.TRUST_PROXY) {
    for (const name of ['x-forwarded-for', 'x-real-ip']) {
      const candidate = request.headers.get(name)?.split(',')[0]?.trim();
      if (candidate && isIP(candidate)) return candidate;
    }
  }
  return server?.requestIP(request)?.address ?? '0.0.0.0';
}

export function getRequestMeta(request: Request, server: ServerLike): RequestMeta {
  const url = new URL(request.url);
  return {
    ip: getClientIp(request, server),
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, 500),
    method: request.method,
    path: (url.pathname + url.search).slice(0, 255),
  };
}
