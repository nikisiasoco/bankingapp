import { randomUUID } from 'node:crypto';

import { count, eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { config } from '../../config';
import { type Db, createDb, createPool } from '../../db/client';
import { accounts, ledgerEntries, transactions } from '../../db/schema';
import {
  createCustomerAccount,
  createSystemAccount,
  fundAccount,
  readBalance,
  resetDatabase,
} from '../../test/fixtures';
import { InsufficientFunds } from './errors';
import { postTransfer, transfer } from './service';

let pool: Pool;
let db: Db;

beforeAll(async () => {
  pool = createPool(config.TEST_DATABASE_URL);
  db = createDb(pool);

  await resetDatabase(db);
  await createSystemAccount(db);
});

afterAll(async () => {
  await pool.end();
});

describe('postTransfer', () => {
  test('rejects an overdraft and leaves both balances untouched', async () => {
    const source = await createCustomerAccount(db);
    const destination = await createCustomerAccount(db);
    await fundAccount(db, source, 10_000n);
    await fundAccount(db, destination, 2_500n);

    const [entriesBefore] = await db
      .select({ total: count() })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, source.accountId));

    await expect(
      postTransfer(db, {
        actorId: source.userId,
        fromAccountId: source.accountId,
        toAccountId: destination.accountId,
        amountMinor: 10_001n,
        kind: 'transfer',
      }),
    ).rejects.toBeInstanceOf(InsufficientFunds);

    expect(await readBalance(db, source.accountId)).toBe(10_000n);
    expect(await readBalance(db, destination.accountId)).toBe(2_500n);

    // Balances alone would also look right if we had written entries and then
    // failed to apply them, so count the entries too.
    const [entriesAfter] = await db
      .select({ total: count() })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, source.accountId));
    expect(entriesAfter!.total).toBe(entriesBefore!.total);
  });

  test('conserves the total across concurrent transfers in both directions', async () => {
    const a = await createCustomerAccount(db);
    const b = await createCustomerAccount(db);
    await fundAccount(db, a, 100_000n);
    await fundAccount(db, b, 100_000n);
    const totalBefore = 200_000n;

    // Eight, not ten: each transaction holds a pool connection for its whole
    // life and createPool caps the pool at ten. Alternating direction is the
    // point of the test, since A->B racing B->A is exactly the pair that
    // deadlocks if the two transactions lock the rows in different orders.
    const amounts = [1_000n, 2_000n, 3_000n, 4_000n, 5_000n, 6_000n, 7_000n, 8_000n];
    const transfers = amounts.map((amountMinor, index) => {
      const [from, to] = index % 2 === 0 ? [a, b] : [b, a];

      return transfer(db, {
        actorId: from.userId,
        fromAccountId: from.accountId,
        toAccountId: to.accountId,
        amountMinor,
      });
    });

    const results = await Promise.allSettled(transfers);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    expect(failures).toEqual([]);

    const balanceA = await readBalance(db, a.accountId);
    const balanceB = await readBalance(db, b.accountId);
    expect(balanceA + balanceB).toBe(totalBefore);

    for (const accountId of [a.accountId, b.accountId]) {
      expect(await sumEntries(db, accountId)).toBe(await readBalance(db, accountId));
    }
  });

  test('replaying an idempotency key produces one transaction, not two', async () => {
    const source = await createCustomerAccount(db);
    const destination = await createCustomerAccount(db);
    await fundAccount(db, source, 50_000n);

    const idempotencyKey = `replay-${randomUUID()}`;
    const request = {
      actorId: source.userId,
      fromAccountId: source.accountId,
      toAccountId: destination.accountId,
      amountMinor: 7_000n,
      idempotencyKey,
    };

    const first = await transfer(db, request);
    const second = await transfer(db, request);
    expect(second.id).toBe(first.id);

    // The same key arriving twice at once is the case the partial unique index
    // exists for: one insert wins, the loser reads the winner's row.
    const [third, fourth] = await Promise.all([transfer(db, request), transfer(db, request)]);
    expect(third.id).toBe(first.id);
    expect(fourth.id).toBe(first.id);

    const [transactionRows] = await db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.idempotencyKey, idempotencyKey));
    expect(transactionRows!.total).toBe(1);

    const [entryRows] = await db
      .select({ total: count() })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, first.id));
    expect(entryRows!.total).toBe(2);

    // Four calls, one movement.
    expect(await readBalance(db, source.accountId)).toBe(43_000n);
    expect(await readBalance(db, destination.accountId)).toBe(7_000n);
  });
});

/**
 * Declared last on purpose. Vitest runs tests within a file in declaration
 * order, so these assert over everything the tests above wrote rather than
 * over an empty database, where they would hold trivially.
 */
describe('ledger invariants', () => {
  test('every balance_minor equals the sum of its ledger entries', async () => {
    const drifted = await db
      .select({
        accountNumber: accounts.accountNumber,
        balanceMinor: accounts.balanceMinor,
        ledgerSumMinor: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::text`,
      })
      .from(accounts)
      .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, accounts.id))
      .groupBy(accounts.id)
      .having(sql`${accounts.balanceMinor} <> coalesce(sum(${ledgerEntries.amountMinor}), 0)`);

    expect(drifted).toEqual([]);
  });

  test('the sum of every row in ledger_entries is exactly zero', async () => {
    const [result] = await db
      .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::text` })
      .from(ledgerEntries);

    // Zero because the system account is the counterparty to every deposit, so
    // the money it minted is present twice with opposite signs.
    expect(BigInt(result!.total)).toBe(0n);

    const [rows] = await db.select({ total: count() }).from(ledgerEntries);
    expect(rows!.total).toBeGreaterThan(0);
  });
});

async function sumEntries(handle: Db, accountId: string): Promise<bigint> {
  const [result] = await handle
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::text` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));

  return BigInt(result!.total);
}
