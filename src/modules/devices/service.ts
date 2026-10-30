import { and, desc, eq, getTableColumns, gt, inArray, isNull, sql } from 'drizzle-orm';
import { status } from 'elysia';
import { apiKeyHistory, db, deviceScoreHistory, devices, smsRequests } from '@/db';
import { generateApiKey, sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { RequestMeta } from '@/lib/request';
import { agoDays, fromNow } from '@/lib/sql';
import { validateDeviceId, validateDeviceName, validatePhoneNumber } from '@/lib/validation';
import { Audit } from '../audit/service';
import { Webhooks } from '../webhooks/service';
import type { DevicesModel } from './model';

const { api_key_hash: _omit, ...publicColumns } = getTableColumns(devices);

const clip = (value: unknown, max: number): string | null => {
  const s = String(value ?? '').trim().slice(0, max);
  return s === '' ? null : s;
};

const countByStatus = (state: string) =>
  sql<number>`(select count(*) from ${smsRequests} where ${smsRequests.device_id} = ${devices.device_id} and ${smsRequests.status} = ${state})`.mapWith(Number);

export abstract class Devices {
  /**
   * API key check (port of authenticateDevice()). Also accepts a rotated key during its
   * grace period — the PHP code stored old keys in api_key_history but never looked at them.
   */
  static async authenticate(
    apiKey: string | undefined,
  ): Promise<{ device_id: string } | { error: string; code: 401 | 403 | 410 }> {
    if (!apiKey) return { error: 'API key required', code: 401 };
    if (apiKey.length !== 64) return { error: 'Invalid API key format', code: 401 };

    const keyHash = sha256(apiKey);
    const pick = { device_id: devices.device_id, is_active: devices.is_active, deleted_at: devices.deleted_at };

    let [device] = await db.select(pick).from(devices).where(eq(devices.api_key_hash, keyHash)).limit(1);

    if (!device) {
      const [old] = await db
        .select({ device_id: apiKeyHistory.device_id })
        .from(apiKeyHistory)
        .where(and(eq(apiKeyHistory.api_key_hash, keyHash), eq(apiKeyHistory.is_active, true), gt(apiKeyHistory.expires_at, sql`now()`)))
        .limit(1);
      if (old) [device] = await db.select(pick).from(devices).where(eq(devices.device_id, old.device_id)).limit(1);
    }

    if (!device) return { error: 'Invalid API key', code: 401 };
    if (device.deleted_at !== null) return { error: 'Device deleted', code: 410 };
    if (!device.is_active) return { error: 'Device is inactive', code: 403 };
    return { device_id: device.device_id };
  }

  static async register(body: DevicesModel['registerBody'], meta: RequestMeta) {
    const deviceId = validateDeviceId(body.device_id);
    if (deviceId === null) return status(400, { error: 'A valid device_id is required (alphanumeric, hyphen, underscore)' });

    const deviceName = validateDeviceName(body.device_name ?? 'Unknown device');
    const phone = body.phone_number !== undefined ? validatePhoneNumber(body.phone_number) : null;
    const info: Record<string, unknown> = body.device_info ?? {};
    const sdk = Number(info.sdk_version);
    const details = {
      imei: clip(info.imei, 20),
      imei2: clip(info.imei2, 20),
      android_version: clip(info.android_version, 20),
      sdk_version: info.sdk_version != null && Number.isFinite(sdk) ? Math.trunc(sdk) : null,
      device_model: clip(info.model, 100),
      device_brand: clip(info.brand, 50),
      device_manufacturer: clip(info.manufacturer, 50),
      hardware_id: clip(info.hardware_id, 64),
      board: clip(info.board, 50),
      fingerprint: clip(info.fingerprint, 255),
      display_resolution: clip(info.display_resolution, 20),
      app_version: clip(info.app_version, 20),
    };

    const { apiKey, keyHash, keyPrefix } = generateApiKey();
    const [existing] = await db
      .select({ id: devices.id, deleted_at: devices.deleted_at })
      .from(devices)
      .where(eq(devices.device_id, deviceId))
      .limit(1);

    if (existing) {
      // Never hand back the existing key (CWE-200): always mint a new one.
      const reactivated = existing.deleted_at !== null;
      await db
        .update(devices)
        .set({
          api_key_hash: keyHash,
          api_key_prefix: keyPrefix,
          device_name: deviceName,
          phone_number: phone,
          last_seen: sql`now()`,
          ...(reactivated ? { is_active: true, deleted_at: null } : {}),
          ...details,
        })
        .where(eq(devices.device_id, deviceId));
      await Audit.log({ action: reactivated ? 'device.reactivated' : 'device.key_rotated', actorType: 'device', actorId: deviceId, meta });

      return reactivated
        ? status(201, { success: true, message: 'Device reactivated', api_key: apiKey })
        : { success: true, message: 'Device already registered, new API key generated', api_key: apiKey };
    }

    await db.insert(devices).values({
      device_id: deviceId,
      device_name: deviceName,
      phone_number: phone,
      api_key_hash: keyHash,
      api_key_prefix: keyPrefix,
      last_seen: sql`now()` as unknown as Date,
      ...details,
    });
    await Audit.log({ action: 'device.registered', actorType: 'device', actorId: deviceId, meta });
    Webhooks.trigger('device.registered', { device_id: deviceId });
    return status(201, { success: true, message: 'Device saved', api_key: apiKey });
  }

  static async list() {
    const rows = await db
      .select({
        ...publicColumns,
        pending_count: countByStatus('pending'),
        sent_count: countByStatus('sent'),
        failed_count: countByStatus('failed'),
      })
      .from(devices)
      .where(isNull(devices.deleted_at))
      .orderBy(sql`${devices.last_seen} desc nulls last`);
    return { success: true, devices: rows };
  }

  static async toggle({ device_id, is_active }: DevicesModel['toggleBody'], meta: RequestMeta) {
    const deviceId = validateDeviceId(device_id);
    if (deviceId === null) return status(400, { error: 'A valid device_id is required' });

    const next = is_active === undefined ? sql`not ${devices.is_active}` : Boolean(is_active);
    const updated = await db
      .update(devices)
      .set({ is_active: next })
      .where(and(eq(devices.device_id, deviceId), isNull(devices.deleted_at)))
      .returning({ id: devices.id });
    if (updated.length === 0) return status(404, { error: 'Device not found' });

    await Audit.log({ action: 'device.toggled', actorType: 'admin', actorId: deviceId, meta });
    return { success: true, message: 'Device status updated' };
  }

  /** Soft delete; queued messages for the device are cancelled. */
  static async remove(rawId: string, meta: RequestMeta) {
    const deviceId = validateDeviceId(rawId);
    if (deviceId === null) return status(400, { error: 'A valid device_id is required' });

    const deleted = await db.transaction(async (tx) => {
      const rows = await tx
        .update(devices)
        .set({ deleted_at: sql`now()`, is_active: false })
        .where(and(eq(devices.device_id, deviceId), isNull(devices.deleted_at)))
        .returning({ id: devices.id });
      if (rows.length === 0) return false;
      await tx
        .update(smsRequests)
        .set({ status: 'cancelled' })
        .where(and(eq(smsRequests.device_id, deviceId), inArray(smsRequests.status, ['pending', 'processing'])));
      return true;
    });
    if (!deleted) return status(404, { error: 'Device not found' });

    await Audit.log({ action: 'device.deleted', actorType: 'admin', actorId: deviceId, meta });
    return { success: true, message: 'Device deleted' };
  }

  static async health() {
    const threshold = env.DEVICE_OFFLINE_THRESHOLD;
    const rows = await db
      .select({
        device_id: devices.device_id,
        device_name: devices.device_name,
        last_seen: devices.last_seen,
        is_active: devices.is_active,
        seconds_since_seen: sql<number | null>`extract(epoch from (now() - ${devices.last_seen}))::int`,
        health_status: sql<'never_connected' | 'offline' | 'online'>`case
          when ${devices.last_seen} is null then 'never_connected'
          when extract(epoch from (now() - ${devices.last_seen})) > ${threshold} then 'offline'
          else 'online' end`,
      })
      .from(devices)
      .where(isNull(devices.deleted_at))
      .orderBy(sql`${devices.last_seen} desc nulls last`);

    const online = rows.filter((d) => d.health_status === 'online').length;
    for (const d of rows) {
      if (d.health_status === 'offline' && d.is_active) {
        Webhooks.trigger('device.offline', { device_id: d.device_id, last_seen: d.last_seen, seconds_offline: d.seconds_since_seen });
      }
    }

    return { success: true, online_count: online, offline_count: rows.length - online, threshold_secs: threshold, devices: rows };
  }

  static async scores() {
    const sent = devices.total_sent;
    const failed = devices.total_failed;
    const rows = await db
      .select({
        device_id: devices.device_id,
        device_name: devices.device_name,
        performance_score: devices.performance_score,
        total_sent: sent,
        total_failed: failed,
        weight: devices.weight,
        last_seen: devices.last_seen,
        is_active: devices.is_active,
        success_rate: sql<number>`case when ${sent} + ${failed} > 0 then round(${sent} * 100.0 / (${sent} + ${failed}), 2) else 100 end`.mapWith(Number),
        is_online: sql<boolean>`(${devices.last_seen} is not null and extract(epoch from (now() - ${devices.last_seen})) < ${env.DEVICE_OFFLINE_THRESHOLD})`,
      })
      .from(devices)
      .where(isNull(devices.deleted_at))
      .orderBy(desc(devices.performance_score));

    const history = await db
      .select({
        device_id: deviceScoreHistory.device_id,
        score: deviceScoreHistory.score,
        success_rate: deviceScoreHistory.success_rate,
        avg_response_ms: deviceScoreHistory.avg_response_ms,
        uptime_pct: deviceScoreHistory.uptime_pct,
        recorded_at: deviceScoreHistory.recorded_at,
      })
      .from(deviceScoreHistory)
      .where(sql`${deviceScoreHistory.recorded_at} >= ${agoDays(7)}`)
      .orderBy(deviceScoreHistory.recorded_at);

    return { success: true, devices: rows, history };
  }

  static async updateCost({ device_id, cost_per_sms }: DevicesModel['costBody']) {
    const deviceId = validateDeviceId(device_id);
    if (deviceId === null) return status(400, { error: 'device_id is required' });
    if (!(cost_per_sms >= 0)) return status(400, { error: 'cost_per_sms must be 0 or greater' });

    const updated = await db
      .update(devices)
      .set({ cost_per_sms })
      .where(and(eq(devices.device_id, deviceId), isNull(devices.deleted_at)))
      .returning({ id: devices.id });
    if (updated.length === 0) return status(404, { error: 'Device not found' });
    return { success: true, message: 'SMS cost updated' };
  }

  /** Load-balancing weight, clamped to 1–100 (new in v4: the PHP API had no way to change it). */
  static async updateWeight({ device_id, weight }: DevicesModel['weightBody']) {
    const deviceId = validateDeviceId(device_id);
    if (deviceId === null) return status(400, { error: 'device_id is required' });
    const w = Math.max(1, Math.min(100, Math.trunc(weight)));
    const updated = await db
      .update(devices)
      .set({ weight: w })
      .where(and(eq(devices.device_id, deviceId), isNull(devices.deleted_at)))
      .returning({ id: devices.id });
    if (updated.length === 0) return status(404, { error: 'Device not found' });
    return { success: true, weight: w, message: 'Weight updated' };
  }

  /** Rotate a device key; the previous key keeps working for 24 hours. */
  static async rotateKey({ device_id }: DevicesModel['rotateBody'], meta: RequestMeta) {
    const deviceId = validateDeviceId(device_id);
    if (deviceId === null) return status(400, { error: 'device_id is required' });

    const next = generateApiKey();
    const found = await db.transaction(async (tx) => {
      const [device] = await tx
        .select({ api_key_hash: devices.api_key_hash, api_key_prefix: devices.api_key_prefix })
        .from(devices)
        .where(and(eq(devices.device_id, deviceId), isNull(devices.deleted_at)))
        .for('update')
        .limit(1);
      if (!device) return false;

      await tx.insert(apiKeyHistory).values({
        device_id: deviceId,
        api_key_hash: device.api_key_hash,
        api_key_prefix: device.api_key_prefix,
        expires_at: fromNow(24 * 3600) as unknown as Date,
        rotated_at: sql`now()` as unknown as Date,
      });
      await tx
        .update(apiKeyHistory)
        .set({ is_active: false })
        .where(and(eq(apiKeyHistory.device_id, deviceId), sql`${apiKeyHistory.expires_at} < now()`));
      await tx.update(devices).set({ api_key_hash: next.keyHash, api_key_prefix: next.keyPrefix }).where(eq(devices.device_id, deviceId));
      return true;
    });
    if (!found) return status(404, { error: 'Device not found' });

    await Audit.log({ action: 'device.key_rotated', actorType: 'admin', actorId: deviceId, meta });
    return {
      success: true,
      new_api_key: next.apiKey,
      grace_period: '24 hours (the old key will keep working during this period)',
      message: 'API key changed successfully',
    };
  }

  static async keyHistory({ device_id }: DevicesModel['keyHistoryQuery']) {
    const deviceId = device_id ? validateDeviceId(device_id) : null;
    const rows = await db
      .select({
        id: apiKeyHistory.id,
        device_id: apiKeyHistory.device_id,
        api_key_prefix: apiKeyHistory.api_key_prefix,
        is_active: apiKeyHistory.is_active,
        expires_at: apiKeyHistory.expires_at,
        rotated_at: apiKeyHistory.rotated_at,
        created_at: apiKeyHistory.created_at,
      })
      .from(apiKeyHistory)
      .where(deviceId ? eq(apiKeyHistory.device_id, deviceId) : undefined)
      .orderBy(desc(apiKeyHistory.created_at))
      .limit(deviceId ? 50 : 100);
    return { success: true, history: rows };
  }
}

