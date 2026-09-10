import { and, desc, eq, lt } from 'drizzle-orm';
import type { TransactionKind } from '@banking/shared';

import type { DbHandle } from '../../db/client';
import { type Transaction, ledgerEntries, transactions } from '../../db/schema';

export type NewTransaction = {
  kind: TransactionKind;
  initiatedBy: string;
  description: string;
  idempotencyKey: string | null;
};

export type NewLedgerEntry = {
  accountId: string;
  amountMinor: bigint;
};

export async function insertTransaction(
  handle: DbHandle,
  input: NewTransaction,
): Promise<Transaction> {
  const [transaction] = await handle.insert(transactions).values(input).returning();

  // The insert either returns a row or throws; this keeps the type honest.
  if (!transaction) throw new Error('Insert of transaction returned no row');
  return transaction;
}

/** Append-only: this is the only write path to ledger_entries. */
export async function insertLedgerEntries(
  handle: DbHandle,
  transactionId: string,
  entries: NewLedgerEntry[],
): Promise<void> {
  await handle
    .insert(ledgerEntries)
    .values(entries.map((entry) => ({ ...entry, transactionId })));
}

export type AccountLedgerEntry = {
  id: bigint;
  transactionId: string;
  kind: TransactionKind;
  description: string;
  amountMinor: bigint;
  createdAt: Date;
};

/**
 * One account's entries, newest first, keyed by ledger entry id rather than an
 * offset so a page cannot shift under a caller who is mid-scroll. Reads along
 * the (account_id, id DESC) index, which exists for exactly this query.
 */
export async function listEntriesForAccount(
  handle: DbHandle,
  accountId: string,
  options: { cursor?: bigint; limit: number },
): Promise<AccountLedgerEntry[]> {
  const beforeCursor =
    options.cursor === undefined ? undefined : lt(ledgerEntries.id, options.cursor);

  return handle
    .select({
      id: ledgerEntries.id,
      transactionId: ledgerEntries.transactionId,
      kind: transactions.kind,
      description: transactions.description,
      amountMinor: ledgerEntries.amountMinor,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .innerJoin(transactions, eq(transactions.id, ledgerEntries.transactionId))
    .where(and(eq(ledgerEntries.accountId, accountId), beforeCursor))
    .orderBy(desc(ledgerEntries.id))
    .limit(options.limit);
}

/**
 * Reached only after the insert below has already lost the race for a key, so
 * it runs on its own handle rather than the aborted transaction's.
 */
export async function findTransactionByIdempotencyKey(
  handle: DbHandle,
  initiatedBy: string,
  idempotencyKey: string,
): Promise<Transaction | undefined> {
  const [transaction] = await handle
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.initiatedBy, initiatedBy),
        eq(transactions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  return transaction;
}
