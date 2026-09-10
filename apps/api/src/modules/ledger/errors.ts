import { AppError } from '../../errors';

/** Names of the constraints we translate, kept next to the code that reads them. */
const NONNEGATIVE_BALANCE_CONSTRAINT = 'accounts_nonnegative_balance';
const IDEMPOTENCY_KEY_CONSTRAINT = 'transactions_initiated_by_idempotency_key_key';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

export class InvalidAmount extends AppError {
  readonly code = 'invalid_amount';

  constructor(amountMinor: bigint) {
    super(`Amount must be a positive number of minor units, got ${amountMinor}`);
  }
}

export class InsufficientFunds extends AppError {
  readonly code = 'insufficient_funds';

  constructor() {
    super('Insufficient funds');
  }
}

export class SameAccountTransfer extends AppError {
  readonly code = 'same_account_transfer';

  constructor() {
    super('Source and destination must be different accounts');
  }
}

/**
 * Only reachable if the original transaction vanished between the losing insert
 * and the read that follows it, which nothing in this application does.
 */
export class DuplicateIdempotencyKey extends AppError {
  readonly code = 'duplicate_idempotency_key';

  constructor() {
    super('An earlier transaction already used this idempotency key');
  }
}

type PostgresErrorShape = { code?: unknown; constraint?: unknown };

type PostgresError = { code: string; constraint?: string };

function asPostgresError(error: unknown): PostgresError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const { code, constraint } = error as PostgresErrorShape;
  if (typeof code !== 'string') return undefined;

  return { code, constraint: typeof constraint === 'string' ? constraint : undefined };
}

/**
 * Drizzle wraps driver failures in a DrizzleQueryError and hangs the real
 * node-postgres error off `cause`, so the SQLSTATE is never on the error we
 * actually catch. Walking the chain keeps that a detail of this file.
 */
function findPostgresError(error: unknown): PostgresError | undefined {
  let current = error;

  for (let depth = 0; current !== undefined && current !== null && depth < 5; depth += 1) {
    const candidate = asPostgresError(current);
    if (candidate) return candidate;
    current = (current as { cause?: unknown }).cause;
  }

  return undefined;
}

/** Distinguishes "someone already used this key" from every other failure. */
export function isIdempotencyKeyViolation(error: unknown): boolean {
  const pgError = findPostgresError(error);

  return pgError?.code === UNIQUE_VIOLATION && pgError.constraint === IDEMPOTENCY_KEY_CONSTRAINT;
}

/**
 * The database constraints are the last line of defence, not a source of 500s.
 * Anything we recognise becomes a domain error; anything else is returned
 * untouched so it can surface as the bug it probably is.
 */
export function mapPostgresError(error: unknown): unknown {
  const pgError = findPostgresError(error);
  if (!pgError) return error;

  if (
    pgError.code === CHECK_VIOLATION &&
    pgError.constraint === NONNEGATIVE_BALANCE_CONSTRAINT
  ) {
    return new InsufficientFunds();
  }

  if (
    pgError.code === UNIQUE_VIOLATION &&
    pgError.constraint === IDEMPOTENCY_KEY_CONSTRAINT
  ) {
    return new DuplicateIdempotencyKey();
  }

  return error;
}
