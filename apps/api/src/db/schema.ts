import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `mode: 'bigint'` is load bearing. node-postgres hands back int8 as a string,
 * and this tells Drizzle to run it through `BigInt()` on the way in and back to
 * a string on the way out. Nothing in the app sees money as a `number`.
 */
const moneyMinor = (name: string) => bigint(name, { mode: 'bigint' });

export const accountKind = pgEnum('account_kind', ['customer', 'system']);
export const transactionKind = pgEnum('transaction_kind', [
  'deposit',
  'withdrawal',
  'transfer',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    accountNumber: text('account_number').notNull().unique(),
    kind: accountKind('kind').notNull(),
    /** Cache of sum(ledger_entries.amount_minor), only ever written in the
     * same transaction as the entries that move it. */
    // `sql` rather than `0n`: drizzle-kit serialises defaults into its JSON
    // snapshot, and JSON.stringify throws on a BigInt.
    balanceMinor: moneyMinor('balance_minor').notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'accounts_customer_has_user',
      sql`(kind = 'customer') = (user_id IS NOT NULL)`,
    ),
    // The last line of defence against an overdraft. Only the system account,
    // which is the mint, may go negative.
    check(
      'accounts_nonnegative_balance',
      sql`kind = 'system' OR balance_minor >= 0`,
    ),
    // Exactly one system account. A unique index on `kind`, restricted to
    // system rows, permits only one of them. Without it the counterparty of
    // every deposit would be whichever row Postgres happened to return first.
    uniqueIndex('accounts_one_system_account').on(t.kind).where(sql`kind = 'system'`),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: transactionKind('kind').notNull(),
    initiatedBy: uuid('initiated_by')
      .notNull()
      .references(() => users.id),
    idempotencyKey: text('idempotency_key'),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial, so the many transactions without a key do not collide on NULL.
    uniqueIndex('transactions_initiated_by_idempotency_key_key')
      .on(t.initiatedBy, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  ],
);

/** Append-only. No updates, no deletes; corrections are reversing transactions. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    /** Signed: negative debits the account, positive credits it. */
    amountMinor: moneyMinor('amount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ledger_entries_amount_nonzero', sql`amount_minor <> 0`),
    // Serves "latest entries for this account" without a sort.
    index('ledger_entries_account_id_id_idx').on(t.accountId, t.id.desc()),
    index('ledger_entries_transaction_id_idx').on(t.transactionId),
  ],
);

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
