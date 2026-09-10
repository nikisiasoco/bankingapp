import {
  type AccountsResponse,
  type TransactionsPage,
  accountIdParam,
  serializeMinorUnits,
  transactionsQuery,
} from '@banking/shared';
import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../auth';
import type { Db } from '../../db/client';
import { listEntriesForAccount } from '../ledger/repository';
import { findAccountForUser, listAccountsForUser } from './repository';

export function registerAccountRoutes(app: FastifyInstance, db: Db): void {
  app.get('/accounts', async (request, reply) => {
    const actor = await authenticate(db, request);
    const accounts = await listAccountsForUser(db, actor.id);

    const body: AccountsResponse = {
      accounts: accounts.map((account) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        balanceMinor: serializeMinorUnits(account.balanceMinor),
      })),
    };
    return reply.code(200).send(body);
  });

  app.get('/accounts/:id/transactions', async (request, reply) => {
    const actor = await authenticate(db, request);
    const { id } = accountIdParam.parse(request.params);
    const { cursor, limit } = transactionsQuery.parse(request.query);

    // Authorization is this line. An account the actor does not own is
    // indistinguishable from one that does not exist.
    await findAccountForUser(db, actor.id, id);

    // One more than asked for, purely to learn whether another page exists.
    const rows = await listEntriesForAccount(db, id, {
      ...(cursor === undefined ? {} : { cursor: BigInt(cursor) }),
      limit: limit + 1,
    });

    const entries = rows.slice(0, limit);
    const last = entries.at(-1);

    const body: TransactionsPage = {
      entries: entries.map((entry) => ({
        id: entry.id.toString(10),
        transactionId: entry.transactionId,
        kind: entry.kind,
        description: entry.description,
        amountMinor: serializeMinorUnits(entry.amountMinor),
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? last.id.toString(10) : null,
    };
    return reply.code(200).send(body);
  });
}
