import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { config } from '../config';
import { createDb, createPool } from './client';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

const useTestDatabase = process.argv.includes('--test');
const connectionString = useTestDatabase ? config.TEST_DATABASE_URL : config.DATABASE_URL;

/** Host and database only: connection strings carry a password. */
function describe(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}`;
}

const pool = createPool(connectionString);

try {
  await migrate(createDb(pool), { migrationsFolder });
  console.log(`Migrated ${describe(connectionString)}`);
} finally {
  await pool.end();
}
