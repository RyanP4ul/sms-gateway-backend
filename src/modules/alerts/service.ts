import { desc, eq } from 'drizzle-orm';
import { status } from 'elysia';
import { alertChannels, db } from '@/db';
import type { AlertsModel } from './model';

export abstract class Alerts {
  static async create({ channel_type, config, events }: AlertsModel['createBody']) {
    if (Object.keys(config).length === 0) return status(400, { error: 'config object is required' });
    const [row] = await db.insert(alertChannels).values({ channel_type, config, events }).returning({ id: alertChannels.id });
    return status(201, { success: true, channel_id: row!.id, message: 'Alert channel created' });
  }

  static async list() {
    return { success: true, channels: await db.select().from(alertChannels).orderBy(desc(alertChannels.created_at)) };
  }

  static async remove(id: number) {
    const deleted = await db.delete(alertChannels).where(eq(alertChannels.id, id)).returning({ id: alertChannels.id });
    if (deleted.length === 0) return status(404, { error: 'Channel not found' });
    return { success: true, message: 'Alert channel deleted' };
  }
}

