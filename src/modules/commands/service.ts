import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { status } from 'elysia';
import { db, deviceCommands, devices } from '@/db';
import type { RequestMeta } from '@/lib/request';
import { fromNow } from '@/lib/sql';
import { toIso } from '@/lib/time';
import { Audit } from '../audit/service';
import type { CommandsModel } from './model';

export abstract class Commands {
  static async create(body: CommandsModel['createBody'], meta: RequestMeta) {
    const deviceId = body.device_id.trim();
    if (deviceId === '') return status(400, { error: 'device_id ve command_type zorunludur' });

    const [device] = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.device_id, deviceId), isNull(devices.deleted_at))).limit(1);
    if (!device) return status(404, { error: 'Cihaz bulunamadı' });

    const minutes = Math.max(1, Math.trunc(body.expires_minutes ?? 30));
    const [row] = await db
      .insert(deviceCommands)
      .values({
        device_id: deviceId,
        command_type: body.command_type,
        payload: body.payload ?? null,
        expires_at: fromNow(minutes * 60) as unknown as Date,
        created_by: 'admin',
      })
      .returning({ id: deviceCommands.id, expires_at: deviceCommands.expires_at });

    await Audit.log({ action: 'device_command.created', actorType: 'admin', actorId: deviceId, details: { command_id: row!.id, type: body.command_type }, meta });
    return status(201, { success: true, command_id: row!.id, message: `Komut oluşturuldu: ${body.command_type}`, expires_at: row!.expires_at });
  }

  static async list({ device_id, status: state, limit }: CommandsModel['listQuery']) {
    const conditions: SQL[] = [];
    if (device_id) conditions.push(eq(deviceCommands.device_id, device_id));
    if (state) conditions.push(eq(deviceCommands.status, state));

    const commands = await db
      .select({ ...deviceCommandColumns, device_name: devices.device_name })
      .from(deviceCommands)
      .leftJoin(devices, eq(deviceCommands.device_id, devices.device_id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(deviceCommands.created_at))
      .limit(Math.min(Math.max(1, Math.trunc(limit ?? 50)), 200));
    return { success: true, commands };
  }

  /** Device polls: expire stale commands, then atomically claim up to 10 pending ones. */
  static async poll(deviceId: string) {
    await db
      .update(deviceCommands)
      .set({ status: 'expired' })
      .where(and(eq(deviceCommands.device_id, deviceId), eq(deviceCommands.status, 'pending'), sql`${deviceCommands.expires_at} < now()`));

    const claimed = await db.execute<{ id: number; command_type: string; payload: unknown; created_at: string; expires_at: string | null }>(sql`
      update device_commands set status = 'sent', sent_at = now()
      where id in (
        select id from device_commands
        where device_id = ${deviceId} and status = 'pending'
        order by created_at asc limit 10
        for update skip locked
      )
      returning id, command_type, payload, created_at, expires_at`);
    const commands = [...claimed]
      .sort((a, b) => a.id - b.id)
      .map((c) => ({ ...c, created_at: toIso(c.created_at), expires_at: toIso(c.expires_at) }));
    return { success: true, commands };
  }

  static async reportResult(deviceId: string, { command_id, success = false, result }: CommandsModel['resultBody']) {
    const id = Math.trunc(command_id);
    if (!(id > 0)) return status(400, { error: 'command_id zorunludur' });

    const updated = await db
      .update(deviceCommands)
      .set({ status: success ? 'executed' : 'failed', result: result ?? null, executed_at: sql`now()` })
      .where(and(eq(deviceCommands.id, id), eq(deviceCommands.device_id, deviceId)))
      .returning({ id: deviceCommands.id });
    if (updated.length === 0) return status(404, { error: 'Komut bulunamadı' });
    return { success: true, message: 'Komut sonucu kaydedildi' };
  }
}

const deviceCommandColumns = {
  id: deviceCommands.id, device_id: deviceCommands.device_id, command_type: deviceCommands.command_type, payload: deviceCommands.payload,
  status: deviceCommands.status, result: deviceCommands.result, created_by: deviceCommands.created_by, sent_at: deviceCommands.sent_at,
  executed_at: deviceCommands.executed_at, expires_at: deviceCommands.expires_at, created_at: deviceCommands.created_at,
};
