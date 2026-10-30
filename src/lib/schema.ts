import { t, type TSchema } from 'elysia';

/**
 * String enum schema WITHOUT an implicit default.
 *
 * `t.UnionEnum([...])` fills in its *first* value whenever the field is missing, which silently turns
 * "no filter" into "filter by <first value>" on optional query params and changes defaults on bodies.
 * Always use this helper for enums in request models.
 */
export function enumOf<const T extends readonly [string, ...string[]]>(values: T) {
  const schema = t.UnionEnum([...values] as [string, ...string[]]);
  delete (schema as { default?: unknown }).default;
  return schema as unknown as TSchema & { static: T[number]; params: [] };
}
