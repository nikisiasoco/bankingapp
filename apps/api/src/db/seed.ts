import { asc, eq, sql } from 'drizzle-orm';

import { config } from '../config';
import { deposit } from '../modules/ledger/service';
import { type Db, createDb, createPool } from './client';
import { type Account, accounts, ledgerEntries, users } from './schema';

const SYSTEM_ACCOUNT_NUMBER = '0000000000';

/**
 * One account each: the application gives a customer a single account, so the
 * seed should not imply otherwise. The schema still permits more, because
 * nothing about a ledger requires the restriction.
 *
 * Opening balances are stated in minor units, because that is what they are.
 * They are posted below as real deposits, so the ledger explains every penny.
 */
const FIXTURES = [
  {
    email: 'alice@example.com',
    displayName: 'Alice Nwosu',
    accountNumber: '1000000001',
    openingBalanceMinor: 250_000n,
  },
  {
    email: 'bob@example.com',
    displayName: 'Bob Fairweather',
    accountNumber: '1000000002',
    openingBalanceMinor: 120_050n,
  },
  {
    email: 'carol@example.com',
    displayName: 'Carol Iversen',
    accountNumber: '1000000003',
    openingBalanceMinor: 75_025n,
  },
];

/**
 * Inserts are conflict-tolerant and the deposits carry idempotency keys, so
 * running the seed twice leaves the database exactly as it was rather than
 * doubling everyone's money.
 */
async function seed(db: Db): Promise<void> {
  const systemAccount = await ensureSystemAccount(db);

  for (const fixture of FIXTURES) {
    const userId = await ensureUser(db, fixture.email, fixture.displayName);
    const account = await ensureCustomerAccount(db, userId, fixture.accountNumber);

    await deposit(db, {
      actorId: userId,
      toAccountId: account.id,
      amountMinor: fixture.openingBalanceMinor,
      description: 'Opening balance',
      idempotencyKey: `seed-open-${fixture.accountNumber}`,
    });
  }

  console.log(`System account ${systemAccount.accountNumber} funded the opening balances.`);
}

async function ensureSystemAccount(db: Db): Promise<Account> {
  const [inserted] = await db
    .insert(accounts)
    .values({
      accountNumber: SYSTEM_ACCOUNT_NUMBER,
      kind: 'system',
      userId: null,
    })
    .onConflictDoNothing({ target: accounts.accountNumber })
    .returning();

  if (inserted) return inserted;
  return findAccountByNumber(db, SYSTEM_ACCOUNT_NUMBER);
}

async function ensureUser(db: Db, email: string, displayName: string): Promise<string> {
  const [inserted] = await db
    .insert(users)
    .values({ email, displayName })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (inserted) return inserted.id;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!existing) throw new Error(`Could not find or create user ${email}`);
  return existing.id;
}

async function ensureCustomerAccount(
  db: Db,
  userId: string,
  accountNumber: string,
): Promise<Account> {
  const [inserted] = await db
    .insert(accounts)
    .values({ accountNumber, kind: 'customer', userId })
    .onConflictDoNothing({ target: accounts.accountNumber })
    .returning();

  if (inserted) return inserted;
  return findAccountByNumber(db, accountNumber);
}

async function findAccountByNumber(db: Db, accountNumber: string): Promise<Account> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.accountNumber, accountNumber))
    .limit(1);

  if (!account) throw new Error(`Could not find or create account ${accountNumber}`);
  return account;
}

/**
 * The cached balance has to equal the sum of the entries behind it. If the seed
 * cannot prove that, nothing later in the project is trustworthy.
 */
async function reportAndVerify(db: Db): Promise<void> {
  const rows = await db
    .select({
      accountNumber: accounts.accountNumber,
      kind: accounts.kind,
      balanceMinor: accounts.balanceMinor,
      // sum() over int8 is numeric, which the driver hands back as a string.
      ledgerSumMinor: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::text`,
    })
    .from(accounts)
    .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, accounts.id))
    .groupBy(accounts.id)
    .orderBy(asc(accounts.accountNumber));

  for (const row of rows) {
    const ledgerSum = BigInt(row.ledgerSumMinor);
    if (ledgerSum !== row.balanceMinor) {
      throw new Error(
        `Account ${row.accountNumber}: balance ${row.balanceMinor} does not match ledger ${ledgerSum}`,
      );
    }

    console.log(
      `${row.accountNumber}  ${row.kind.padEnd(8)}  ${formatMinor(row.balanceMinor)}`,
    );
  }

  console.log(`\n${rows.length} accounts, every balance matching its ledger entries.`);
}

/** bigint arithmetic only: no division that could round a penny away. */
function formatMinor(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const major = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${minor}`;
}

const pool = createPool(config.DATABASE_URL);

try {
  const db = createDb(pool);
  await seed(db);
  await reportAndVerify(db);
} finally {
  await pool.end();
}
