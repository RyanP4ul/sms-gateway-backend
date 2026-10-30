import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './index';

await migrate(db, { migrationsFolder: './drizzle' });
console.log('✔ migrations applied');
await client.end();
