import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from './db/client';
import { Unauthenticated } from './errors';
import { findUserById } from './modules/users/repository';

/**
 * Everything about identity lives in this file, so replacing mocked sign in
 * with the real thing is a change here and nowhere else.
 *
 * What production would need that this does not do:
 *
 * - Hold a credential per user. There is one shared demo password below and no
 *   password column in the schema. Production stores an Argon2id hash per user
 *   and compares in constant time, or delegates to an OIDC provider.
 * - Store sessions server side, so a session can be revoked. A signed cookie
 *   is valid until it expires no matter what happens to the account.
 * - Expire and rotate. A fixed lifetime plus a new session id on each use, so a
 *   stolen cookie has a short life and reuse is detectable.
 * - Set `secure` so the cookie never crosses plain HTTP, and pin the domain.
 * - Defend against CSRF. Cookie auth means a third party site can make the
 *   browser send this cookie; `sameSite: 'lax'` is a floor, not a solution.
 * - Rate limit and lock out sign in attempts, per account and per address.
 * - Support a second factor, and step up re-authentication before moving money.
 * - Log authentication events for audit: sign in, sign out, failure, and from
 *   where.
 */

export const SESSION_COOKIE = 'session';

/**
 * The whole credential check. One password for every seeded user, so the demo
 * has a login gate you can actually log out of and back into.
 *
 * This is not authentication. A real one is per user, hashed, and compared in
 * constant time; see the list above.
 */
const DEMO_PASSWORD = 'password';

export function verifyPassword(password: string): boolean {
  return password === DEMO_PASSWORD;
}

/** What the rest of the application is allowed to know about the caller. */
export type Actor = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * Turns a request into an actor, or refuses. Handlers call this first: an
 * `actorId` is the only key to every ownership check, and this is the only
 * place one comes from, so a handler that skips it has nothing to pass.
 */
export async function authenticate(db: Db, request: FastifyRequest): Promise<Actor> {
  const cookie = request.cookies[SESSION_COOKIE];
  if (!cookie) throw new Unauthenticated();

  // The signature is what stops a caller editing the cookie into somebody
  // else's id. Sign in is mocked; impersonation is not on offer.
  const unsigned = request.unsignCookie(cookie);
  if (!unsigned.valid || unsigned.value === null) throw new Unauthenticated();

  const user = await findUserById(db, unsigned.value);
  if (!user) throw new Unauthenticated();

  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  reply.setCookie(SESSION_COOKIE, userId, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
