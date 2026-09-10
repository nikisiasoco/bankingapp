import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Db } from './db/client';
import { registerErrorHandler } from './error-handler';
import { registerAccountRoutes } from './modules/accounts/routes';
import { registerLedgerRoutes } from './modules/ledger/routes';
import { registerSessionRoutes } from './modules/session/routes';

export type BuildAppOptions = {
  sessionSecret: string;
  logLevel?: string;
};

/**
 * Takes its database rather than importing one, for the same reason every
 * repository takes a handle: the test suite points it at db_test and needs no
 * mocking to do it.
 */
export async function buildApp(db: Db, options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logLevel === undefined ? false : { level: options.logLevel },
  });

  await app.register(cookie, { secret: options.sessionSecret });

  registerErrorHandler(app);

  await app.register(
    async (api) => {
      registerSessionRoutes(api, db);
      registerAccountRoutes(api, db);
      registerLedgerRoutes(api, db);
    },
    { prefix: '/api' },
  );

  return app;
}
