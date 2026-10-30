import { sql } from 'drizzle-orm';

/** `now() - N seconds` — replaces MySQL `DATE_SUB(NOW(), INTERVAL N SECOND)`. */
export const ago = (seconds: number) => sql`now() - make_interval(secs => ${seconds}::double precision)`;
export const agoMinutes = (m: number) => ago(m * 60);
export const agoHours = (h: number) => ago(h * 3600);
export const agoDays = (d: number) => ago(d * 86_400);
/** `now() + N seconds` — replaces `DATE_ADD(NOW(), INTERVAL N SECOND)`. */
export const fromNow = (seconds: number) => sql`now() + make_interval(secs => ${seconds}::double precision)`;
/** Seconds between a timestamp column and now (replaces `TIMESTAMPDIFF(SECOND, col, NOW())`). */
export const secondsSince = (col: unknown) => sql<number>`extract(epoch from (now() - ${col}))`.mapWith(Number);
/** `count(*) filter (where …)` as a JS number — replaces `SUM(CASE WHEN … THEN 1 ELSE 0 END)`. */
export const countWhere = (cond: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number);
