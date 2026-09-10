/**
 * Every condition the application models deliberately. The union exists so the
 * HTTP layer can prove it has a status for all of them: adding a member without
 * adding a status is a type error, not a surprise 500 in production.
 *
 * The codes live here, in the domain. The statuses do not.
 */
export type AppErrorCode =
  | 'unauthenticated'
  | 'account_not_found'
  | 'invalid_amount'
  | 'insufficient_funds'
  | 'same_account_transfer'
  | 'duplicate_idempotency_key';

/**
 * The base every domain error extends, so the HTTP layer can tell a condition
 * we modelled from a bug we did not.
 */
export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** No usable session on the request. Says nothing about why. */
export class Unauthenticated extends AppError {
  readonly code = 'unauthenticated';

  constructor() {
    super('Not signed in');
  }
}

/**
 * Lives here rather than in a feature module because any module that looks up
 * an account throws it. Also thrown when the actor simply does not own the
 * account: telling an actor that an account exists but is not theirs is a
 * disclosure we do not need.
 */
export class AccountNotFound extends AppError {
  readonly code = 'account_not_found';

  constructor() {
    super('Account not found');
  }
}
