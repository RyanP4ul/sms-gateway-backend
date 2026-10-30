import { eq } from 'drizzle-orm';
import { status } from 'elysia';
import { apiVersions, db } from '@/db';
import type { RequestMeta } from '@/lib/request';
import { Audit } from '../audit/service';
import type { ApiVersionsModel } from './model';

const toDate = (v: string | null | undefined): Date | null | undefined => (v === undefined ? undefined : v === null || v === '' ? null : new Date(v));

export abstract class ApiVersions {
  static async list() {
    return { success: true, versions: await db.select().from(apiVersions).orderBy(apiVersions.version) };
  }

  /** Create the version if it doesn't exist, otherwise update the supplied fields. */
  static async upsert(body: ApiVersionsModel['upsertBody'], meta: RequestMeta) {
    const version = body.version.trim();
    if (version === '' || version.length > 10) return status(400, { error: 'version zorunludur' });

    const deprecated = toDate(body.deprecated_at);
    const sunset = toDate(body.sunset_at);
    if ([deprecated, sunset].some((d) => d instanceof Date && Number.isNaN(d.getTime()))) return status(400, { error: 'Geçersiz tarih' });

    const isActive = body.is_active === undefined ? undefined : Boolean(body.is_active);
    const isDefault = body.is_default === undefined ? undefined : Boolean(body.is_default);
    const changelog = body.changelog?.trim() || undefined;

    await db.transaction(async (tx) => {
      if (isDefault) await tx.update(apiVersions).set({ is_default: false });
      const [existing] = await tx.select({ id: apiVersions.id }).from(apiVersions).where(eq(apiVersions.version, version)).limit(1);
      if (!existing) {
        await tx.insert(apiVersions).values({
          version, is_active: isActive ?? true, is_default: isDefault ?? false, changelog: changelog ?? null,
          deprecated_at: deprecated ?? null, sunset_at: sunset ?? null,
        });
      } else {
        const patch = { is_active: isActive, is_default: isDefault, changelog, deprecated_at: deprecated, sunset_at: sunset };
        const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
        if (Object.keys(defined).length) await tx.update(apiVersions).set(defined).where(eq(apiVersions.version, version));
      }
    });

    await Audit.log({ action: 'api_version.updated', actorType: 'admin', details: { version }, meta });
    return { success: true, message: `API versiyon güncellendi: ${version}` };
  }
}
