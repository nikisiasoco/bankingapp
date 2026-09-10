import type { ErrorResponse } from '@banking/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { AppError, type AppErrorCode } from './errors';

/**
 * The only mapping from a domain failure to a status code in the codebase. No
 * handler sets one; they throw and this decides.
 *
 * Typed as a total record over AppErrorCode, so a new domain error without a
 * status fails typecheck rather than quietly becoming a 500.
 */
const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  account_not_found: 404,
  duplicate_idempotency_key: 409,
  invalid_amount: 422,
  insufficient_funds: 422,
  same_account_transfer: 422,
};

/** A malformed request never reached the domain, so it is a 400, not a 422. */
function validationFailure(error: ZodError): ErrorResponse {
  return {
    error: {
      code: 'validation_failed',
      message: 'Request failed validation',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  };
}

/**
 * Fastify raises its own 4xx before a handler runs, for a malformed JSON body
 * or an unsupported content type. Those are the client's fault, so they keep
 * their status instead of being flattened into a 500.
 */
function clientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const { statusCode } = error as { statusCode?: unknown };
  if (typeof statusCode !== 'number') return undefined;

  return statusCode >= 400 && statusCode < 500 ? statusCode : undefined;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send(validationFailure(error));
    }

    if (error instanceof AppError) {
      const body: ErrorResponse = { error: { code: error.code, message: error.message } };
      return reply.code(STATUS_BY_CODE[error.code]).send(body);
    }

    const status = clientErrorStatus(error);
    if (status !== undefined) {
      const body: ErrorResponse = {
        error: { code: 'bad_request', message: 'Request could not be read' },
      };
      return reply.code(status).send(body);
    }

    // Anything left is a bug or an outage. Log the detail, return none of it.
    request.log.error({ err: error }, 'Unhandled error');

    const body: ErrorResponse = {
      error: { code: 'internal_error', message: 'Something went wrong' },
    };
    return reply.code(500).send(body);
  });

  // Without this an unmatched route would answer in Fastify's shape, not ours.
  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    const body: ErrorResponse = {
      error: { code: 'not_found', message: 'No such endpoint' },
    };
    return reply.code(404).send(body);
  });
}
