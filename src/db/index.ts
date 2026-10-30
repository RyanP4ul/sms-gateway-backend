import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Single shared connection pool (replaces the PHP `getDBConnection()` singleton).
 * The session time zone is pinned so `current_date`, `::date` and `extract(hour …)`
 * behave like the old MySQL setup did for the configured TIMEZONE.
 */
export const client = postgres(env.DATABASE_URL, {
  prepare: false,
  max: env.DB_POOL_SIZE,
  idle_timeout: 30,
  connect_timeout: 10,
  connection: {
    TimeZone: env.TIMEZONE || "Asia/Manila",
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  },
});

export const db = drizzle({ client });
export type Database = typeof db;
export * from "./schema";
