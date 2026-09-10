import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { DbHandle } from '../../db/client';
import { type Account, accounts } from '../../db/schema';
import { AccountNotFound } from '../../errors';

/**
 * The only way to reach an account the actor owns. Authorization lives here
 * rather than in middleware, so a route physically cannot forget it, and a
 * miss is indistinguishable from a non-existent account.
 */
export async function findAccountForUser(
  handle: DbHandle,
  userId: string,
  accountId: string,
): Promise<Account> {
  const [account] = await handle
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) throw new AccountNotFound();
  return account;
}

/**
 * Every account the actor owns. No `kind` filter is needed: the system account
 * has a null `user_id`, so it cannot match anybody.
 */
export async function listAccountsForUser(
  handle: DbHandle,
  userId: string,
): Promise<Account[]> {
  return handle
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.accountNumber));
}

/**
 * For the far side of a movement, which the actor does not need to own. Never
 * use this for the account the actor is acting on.
 */
export async function findCounterpartyAccount(
  handle: DbHandle,
  accountId: string,
): Promise<Account> {
  const [account] = await handle
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) throw new AccountNotFound();
  return account;
}

/**
 * How a transfer names its destination. Existence only, like
 * findCounterpartyAccount: an account number is what one customer gives
 * another, so the actor is not expected to own it.
 */
export async function findAccountByNumber(
  handle: DbHandle,
  accountNumber: string,
): Promise<Account> {
  const [account] = await handle
    .select()
    .from(accounts)
    .where(eq(accounts.accountNumber, accountNumber))
    .limit(1);

  if (!account) throw new AccountNotFound();
  return account;
}

/**
 * The seeded counterparty that makes a deposit or withdrawal a transfer. The
 * partial unique index on (kind) WHERE kind = 'system' is what makes this
 * lookup single valued rather than "whichever row Postgres returned first".
 */
export async function findSystemAccount(handle: DbHandle): Promise<Account> {
  const [account] = await handle
    .select()
    .from(accounts)
    .where(eq(accounts.kind, 'system'))
    .limit(1);

  if (!account) throw new AccountNotFound();
  return account;
}

export async function lockAccounts(
  handle: DbHandle,
  accountIds: string[],
): Promise<Account[]> {
  return handle
    .select()
    .from(accounts)
    .where(inArray(accounts.id, accountIds))
    // Ordering by id is what prevents deadlock: simultaneous A->B and B->A
    // transfers request the same two row locks in the same sequence, so one
    // waits for the other instead of each holding what the other needs.
    // Postgres happens to return a two element IN list on the primary key in
    // id order anyway, but that is the planner's choice, not a guarantee.
    .orderBy(asc(accounts.id))
    .for('update');
}

/**
 * Moves the cached balance by exactly the amount of the ledger entry. The
 * addition happens in Postgres so the stored value can never drift from a
 * balance we read a moment earlier, and `.toString()` keeps the bigint out of
 * the driver's parameter serialiser, which cannot handle one.
 */
export async function applyBalanceDelta(
  handle: DbHandle,
  accountId: string,
  deltaMinor: bigint,
): Promise<void> {
  await handle
    .update(accounts)
    .set({
      balanceMinor: sql`${accounts.balanceMinor} + ${deltaMinor.toString()}::bigint`,
    })
    .where(eq(accounts.id, accountId));
}
