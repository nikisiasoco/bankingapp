import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { config } from '../config';
import { InsufficientFunds, mapPostgresError } from '../modules/ledger/errors';
import { type Db, createDb, createPool } from './client';
import { accounts, users } from './schema';

let pool: Pool;
let db: Db;
let accountId: string;
let userId: string;

beforeAll(async () => {
  pool = createPool(config.TEST_DATABASE_URL);
  db = createDb(pool);

  const suffix = randomUUID();
  const [user] = await db
    .insert(users)
    .values({ email: `check-${suffix}@example.com`, displayName: 'Check Constraint' })
    .returning();
  const [account] = await db
    .insert(accounts)
    .values({
      accountNumber: `test-${suffix}`,
      kind: 'customer',
      userId: user!.id,
    })
    .returning();

  userId = user!.id;
  accountId = account!.id;
});

afterAll(async () => {
  await db.delete(accounts).where(eq(accounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

/**
 * Deliberately bypasses the service layer. The service refuses an overdraft
 * before it writes, and this proves the database would refuse it anyway.
 */
test('a customer balance cannot go negative, and the violation is a domain error', async () => {
  let caught: unknown;

  try {
    await db
      .update(accounts)
      .set({ balanceMinor: sql`-1` })
      .where(eq(accounts.id, accountId));
  } catch (error) {
    caught = error;
  }

  // Drizzle wraps the driver error, so the SQLSTATE arrives one level down.
  expect((caught as { cause?: unknown }).cause).toMatchObject({
    code: '23514',
    constraint: 'accounts_nonnegative_balance',
  });
  expect(mapPostgresError(caught)).toBeInstanceOf(InsufficientFunds);
});
