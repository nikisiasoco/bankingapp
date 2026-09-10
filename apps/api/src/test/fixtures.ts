import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { type Account, accounts, users } from '../db/schema';
import { deposit } from '../modules/ledger/service';

export type CustomerAccount = {
  userId: string;
  accountId: string;
  /** Both needed by the HTTP tests: one to sign in as, one to transfer to. */
  email: string;
  accountNumber: string;
};

/**
 * db_test keeps its data directory in tmpfs and exists for exactly this, so
 * emptying it is free. It also makes the two ledger invariants mean something:
 * over a database of leftovers they could pass by luck.
 *
 * One statement rather than four, because listing every table in the foreign
 * key graph together is what lets Postgres truncate them without CASCADE.
 */
export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`truncate ledger_entries, transactions, accounts, users`);
}

/** Exactly one of these; the partial unique index enforces it. */
export async function createSystemAccount(db: Db): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({
      accountNumber: 'system',
      kind: 'system',
      userId: null,
    })
    .returning();

  if (!account) throw new Error('Failed to create system account');
  return account;
}

export async function createCustomerAccount(db: Db): Promise<CustomerAccount> {
  const suffix = randomUUID();

  const [user] = await db
    .insert(users)
    .values({ email: `${suffix}@example.test`, displayName: `User ${suffix.slice(0, 8)}` })
    .returning();
  if (!user) throw new Error('Failed to create user');

  const [account] = await db
    .insert(accounts)
    .values({ accountNumber: suffix, kind: 'customer', userId: user.id })
    .returning();
  if (!account) throw new Error('Failed to create account');

  return {
    userId: user.id,
    accountId: account.id,
    email: user.email,
    accountNumber: account.accountNumber,
  };
}

/**
 * Funds through the real deposit path, never by writing balance_minor. A direct
 * balance write would break both ledger invariants by construction, which is
 * precisely what the tests asserting them exist to catch.
 */
export async function fundAccount(
  db: Db,
  account: CustomerAccount,
  amountMinor: bigint,
): Promise<void> {
  await deposit(db, {
    actorId: account.userId,
    toAccountId: account.accountId,
    amountMinor,
    description: 'Test opening balance',
  });
}

export async function readBalance(db: Db, accountId: string): Promise<bigint> {
  const [account] = await db
    .select({ balanceMinor: accounts.balanceMinor })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) throw new Error(`No account ${accountId}`);
  return account.balanceMinor;
}
