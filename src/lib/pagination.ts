import { t } from 'elysia';

/** Shared `?page=&limit=` query schema. Mirrors getPaginationParams(): page ≥ 1, 1 ≤ limit ≤ 100 (default 20). */
export const PaginationQuery = t.Object({
  page: t.Optional(t.Numeric()),
  limit: t.Optional(t.Numeric()),
});

export function paginate(q: { page?: number; limit?: number }) {
  const page = Math.max(1, Math.trunc(q.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(q.limit ?? 20)));
  return { page, limit, offset: (page - 1) * limit };
}

export const pageMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  total_pages: Math.ceil(total / limit),
});
