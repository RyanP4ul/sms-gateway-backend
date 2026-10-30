/** Typed environment (port of config.php). Values come from process.env / Bun's automatic .env loading. */
const str = (key: string, fallback = ''): string => process.env[key] ?? fallback;
const int = (key: string, fallback: number): number => {
  const n = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (key: string, fallback = false): boolean => {
  const v = process.env[key];
  return v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

export const env = {
  // Database
  DATABASE_URL: str('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/smsgateway'),
  DB_POOL_SIZE: int('DB_POOL_SIZE', 10),
  DB_STATEMENT_TIMEOUT_MS: int('DB_STATEMENT_TIMEOUT_MS', 10_000),

  // Server
  PORT: int('PORT', 3001),
  HOST: str('HOST', '0.0.0.0'),
  APP_URL: str('APP_URL', 'http://localhost:3001').replace(/\/$/, ''),
  /** Trust X-Forwarded-For / X-Real-IP. Only enable behind a proxy you control. */
  TRUST_PROXY: bool('TRUST_PROXY', false),

  // Security
  ADMIN_TOKEN: str('ADMIN_TOKEN'),
  REGISTRATION_SECRET: str('REGISTRATION_SECRET'),
  CORS_ALLOWED_ORIGINS: str('CORS_ALLOWED_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  RATE_LIMIT_REQUESTS: int('RATE_LIMIT_REQUESTS', 60),
  RATE_LIMIT_WINDOW: int('RATE_LIMIT_WINDOW', 60),

  // Application
  APP_ENV: str('APP_ENV', 'production'),
  APP_DEBUG: bool('APP_DEBUG', false),
  TIMEZONE: str('TIMEZONE', 'Europe/Istanbul'),
  MAX_SMS_LENGTH: int('MAX_SMS_LENGTH', 918),
  MAX_BULK_SIZE: int('MAX_BULK_SIZE', 500),
  SMS_RETRY_MAX: int('SMS_RETRY_MAX', 3),
  DEVICE_OFFLINE_THRESHOLD: int('DEVICE_OFFLINE_THRESHOLD', 300),

  // Background jobs (cron.php). Disable on all but one instance when scaling out.
  CRON_ENABLED: bool('CRON_ENABLED', true),
} as const;

export const isDev = env.APP_ENV === 'development';
