import type { TransactionKind } from '@banking/shared';

import type { Db, Tx } from '../../db/client';
import type { Transaction } from '../../db/schema';
import { AccountNotFound } from '../../errors';
import {
  applyBalanceDelta,
  findAccountByNumber,
  findAccountForUser,
  findCounterpartyAccount,
  findSystemAccount,
  lockAccounts,
} from '../accounts/repository';
import {
  DuplicateIdempotencyKey,
  InsufficientFunds,
  InvalidAmount,
  SameAccountTransfer,
  isIdempotencyKeyViolation,
  mapPostgresError,
} from './errors';
import {
  type NewLedgerEntry,
  findTransactionByIdempotencyKey,
  insertLedgerEntries,
  insertTransaction,
} from './repository';

export type PostTransferInput = {
  actorId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: bigint;
  kind: TransactionKind;
  idempotencyKey?: string | null;
  description?: string;
};

const DEFAULT_DESCRIPTION: Record<TransactionKind, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  transfer: 'Transfer',
};

/**
 * The only function in the system that moves money. Deposits and withdrawals
 * are transfers against the system account, so there is one code path to audit.
 */
export async function postTransfer(
  db: Db,
  input: PostTransferInput,
): Promise<Transaction> {
  // Cheap validation first: neither of these needs a row, so neither needs a
  // transaction. Everything that does need a row is checked under lock below.
  if (input.amountMinor <= 0n) throw new InvalidAmount(input.amountMinor);
  if (input.fromAccountId === input.toAccountId) throw new SameAccountTransfer();

  const idempotencyKey = input.idempotencyKey ?? null;

  try {
    return await db.transaction(async (tx) => {
      await authorize(tx, input);

      const locked = await lockAccounts(tx, [input.fromAccountId, input.toAccountId]);
      const from = locked.find((account) => account.id === input.fromAccountId);
      const to = locked.find((account) => account.id === input.toAccountId);
      // authorize() already proved both rows exist, so a miss here means one
      // was deleted underneath us, which nothing in this application does.
      if (!from || !to) throw new AccountNotFound();

      // The system account is the mint and may go negative; everyone else pays
      // from what they have. The CHECK constraint backs this up.
      if (from.kind !== 'system' && from.balanceMinor < input.amountMinor) {
        throw new InsufficientFunds();
      }

      const entries: NewLedgerEntry[] = [
        { accountId: from.id, amountMinor: -input.amountMinor },
        { accountId: to.id, amountMinor: input.amountMinor },
      ];
      assertBalanced(entries);

      const transaction = await insertTransaction(tx, {
        kind: input.kind,
        initiatedBy: input.actorId,
        description: input.description ?? DEFAULT_DESCRIPTION[input.kind],
        idempotencyKey,
      });

      await insertLedgerEntries(tx, transaction.id, entries);

      for (const entry of entries) {
        await applyBalanceDelta(tx, entry.accountId, entry.amountMinor);
      }

      return transaction;
    });
  } catch (error) {
    // A unique violation aborts the whole Postgres transaction, so we cannot
    // recover inside it: every further statement on that handle would fail with
    // 25P02. Catching out here means the rollback is already total, and the
    // caller gets the transaction the winning insert created. A retry is
    // therefore indistinguishable from the original call.
    if (idempotencyKey !== null && isIdempotencyKeyViolation(error)) {
      const original = await findTransactionByIdempotencyKey(db, input.actorId, idempotencyKey);
      if (original) return original;
      throw new DuplicateIdempotencyKey();
    }

    throw mapPostgresError(error);
  }
}

/**
 * The actor must own the account the money is theirs to move: the destination
 * of a deposit, the source of anything else. The far side only has to exist.
 * Both reads go through the accounts repository, which is where ownership is
 * enforced, and both run inside the transaction so authorization and write
 * cannot be separated. Neither read takes a lock, because locking the owned
 * account first would defeat the id ordering that lockAccounts relies on.
 */
async function authorize(tx: Tx, input: PostTransferInput): Promise<void> {
  if (input.kind === 'deposit') {
    await findAccountForUser(tx, input.actorId, input.toAccountId);
    await findCounterpartyAccount(tx, input.fromAccountId);
    return;
  }

  await findAccountForUser(tx, input.actorId, input.fromAccountId);
  await findCounterpartyAccount(tx, input.toAccountId);
}

/** Double entry in one line: what leaves one account arrives in another. */
function assertBalanced(entries: NewLedgerEntry[]): void {
  const sum = entries.reduce((total, entry) => total + entry.amountMinor, 0n);
  if (sum !== 0n) throw new Error(`Ledger entries must sum to zero, got ${sum}`);
}

export type TransferInput = {
  actorId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: bigint;
  idempotencyKey?: string | null;
  description?: string;
};

export type DepositInput = {
  actorId: string;
  toAccountId: string;
  amountMinor: bigint;
  idempotencyKey?: string | null;
  description?: string;
};

export type WithdrawalInput = {
  actorId: string;
  fromAccountId: string;
  amountMinor: bigint;
  idempotencyKey?: string | null;
  description?: string;
};

export function transfer(db: Db, input: TransferInput): Promise<Transaction> {
  return postTransfer(db, { ...input, kind: 'transfer' });
}

/**
 * Money comes from the system account. Resolving it only fills in the
 * counterparty id; the ownership check on the destination happens inside
 * postTransfer, under lock.
 */
export async function deposit(db: Db, input: DepositInput): Promise<Transaction> {
  const system = await findSystemAccount(db);

  return postTransfer(db, { ...input, kind: 'deposit', fromAccountId: system.id });
}

/** Money goes to the system account. */
export async function withdraw(db: Db, input: WithdrawalInput): Promise<Transaction> {
  const system = await findSystemAccount(db);

  return postTransfer(db, { ...input, kind: 'withdrawal', toAccountId: system.id });
}

export type TransferByNumberInput = {
  actorId: string;
  fromAccountId: string;
  toAccountNumber: string;
  amountMinor: bigint;
  idempotencyKey?: string | null;
  description?: string;
};

/**
 * How the API names a destination, since an account number is the thing one
 * customer can give another. Resolving it here rather than in the handler keeps
 * the repository call out of the route, and postTransfer still checks that the
 * destination exists inside the transaction.
 */
export async function transferToAccountNumber(
  db: Db,
  input: TransferByNumberInput,
): Promise<Transaction> {
  const { toAccountNumber, ...rest } = input;
  const destination = await findAccountByNumber(db, toAccountNumber);

  return postTransfer(db, { ...rest, kind: 'transfer', toAccountId: destination.id });
}
