import { type MeResponse, signInBody } from '@banking/shared';
import type { FastifyInstance } from 'fastify';

import {
  authenticate,
  clearSessionCookie,
  setSessionCookie,
  verifyPassword,
} from '../../auth';
import type { Db } from '../../db/client';
import { Unauthenticated } from '../../errors';
import { findUserByEmail } from '../users/repository';

export function registerSessionRoutes(app: FastifyInstance, db: Db): void {
  /**
   * Mocked sign in: a known email and the shared demo password. An unknown
   * address and a wrong password fail identically, so the endpoint cannot be
   * used to discover who banks here.
   */
  app.post('/session', async (request, reply) => {
    const { email, password } = signInBody.parse(request.body);

    const user = await findUserByEmail(db, email);
    if (!user || !verifyPassword(password)) throw new Unauthenticated();

    setSessionCookie(reply, user.id);

    const body: MeResponse = {
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
    return reply.code(200).send(body);
  });

  app.delete('/session', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/me', async (request, reply) => {
    const actor = await authenticate(db, request);

    const body: MeResponse = { user: actor };
    return reply.code(200).send(body);
  });
}
