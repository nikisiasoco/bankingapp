import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export type Schema = typeof schema;

export type Db = NodePgDatabase<Schema>;

export type Tx = PgTransaction<
  NodePgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

/**
 * Every repository function takes one of these as its first argument, so the
 * service layer decides where a transaction starts and ends.
 */
export type DbHandle = Db | Tx;

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}
