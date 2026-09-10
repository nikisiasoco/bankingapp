import {
  type TransactionResponse,
  accountIdParam,
  amountBody,
  idempotencyKey,
  transferBody,
} from '@banking/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { authenticate } from '../../auth';
import type { Db } from '../../db/client';
import type { Transaction } from '../../db/schema';
import { deposit, transferToAccountNumber, withdraw } from './service';

/**
 * Optional, and parsed rather than trusted: a caller that supplies one gets a
 * retry that cannot move the money twice.
 */
function readIdempotencyKey(request: FastifyRequest): string | null {
  const header = request.headers['idempotency-key'];
  if (header === undefined) return null;

  return idempotencyKey.parse(header);
}

function transactionResponse(transaction: Transaction): TransactionResponse {
  return {
    transaction: {
      id: transaction.id,
      kind: transaction.kind,
      description: transaction.description,
      createdAt: transaction.createdAt.toISOString(),
    },
  };
}

export function registerLedgerRoutes(app: FastifyInstance, db: Db): void {
  app.post('/accounts/:id/deposits', async (request, reply) => {
    const actor = await authenticate(db, request);
    const { id } = accountIdParam.parse(request.params);
    const { amountMinor } = amountBody.parse(request.body);

    const transaction = await deposit(db, {
      actorId: actor.id,
      toAccountId: id,
      amountMinor,
      idempotencyKey: readIdempotencyKey(request),
    });

    return reply.code(200).send(transactionResponse(transaction));
  });

  app.post('/accounts/:id/withdrawals', async (request, reply) => {
    const actor = await authenticate(db, request);
    const { id } = accountIdParam.parse(request.params);
    const { amountMinor } = amountBody.parse(request.body);

    const transaction = await withdraw(db, {
      actorId: actor.id,
      fromAccountId: id,
      amountMinor,
      idempotencyKey: readIdempotencyKey(request),
    });

    return reply.code(200).send(transactionResponse(transaction));
  });

  /**
   * The destination is named by account number, which the actor is not
   * expected to own. Only the source has to be theirs.
   */
  app.post('/transfers', async (request, reply) => {
    const actor = await authenticate(db, request);
    const { fromAccountId, toAccountNumber, amountMinor } = transferBody.parse(request.body);

    const transaction = await transferToAccountNumber(db, {
      actorId: actor.id,
      fromAccountId,
      toAccountNumber,
      amountMinor,
      idempotencyKey: readIdempotencyKey(request),
    });

    return reply.code(200).send(transactionResponse(transaction));
  });
}
