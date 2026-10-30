/**
 * Raw `db.execute(sql…)` results skip Drizzle's column mapping (it installs pass-through parsers for date types),
 * so timestamps arrive as Postgres text like `2026-10-28 04:32:01.839+03`. Normalise them to ISO-8601 so every
 * endpoint speaks the same format.
 */
export const toIso = (value: string | Date | null | undefined): string | null =>
  value === null || value === undefined ? null : new Date(value).toISOString();
