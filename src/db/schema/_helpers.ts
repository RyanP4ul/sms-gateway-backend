import { timestamp } from 'drizzle-orm/pg-core';

/** timestamptz column; the column name is taken from the object key. */
export const ts = () => timestamp({ withTimezone: true, mode: 'date' });
export const createdAt = () => ts().notNull().defaultNow();
/**
 * MySQL had `ON UPDATE CURRENT_TIMESTAMP`; Postgres does not.
 * `$onUpdate` covers Drizzle updates — raw SQL updates must set `updated_at = now()` themselves.
 */
export const updatedAt = () =>
  ts().notNull().defaultNow().$onUpdate(() => new Date());
