import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { buildApp } from './app';
import { config } from './config';
import { type Db, createDb, createPool } from './db/client';
import {
  type CustomerAccount,
  createCustomerAccount,
  createSystemAccount,
  fundAccount,
  resetDatabase,
} from './test/fixtures';
import { signIn } from './test/http';

let pool: Pool;
let db: Db;
let app: FastifyInstance;

/** Alice acts; Bob exists so that Alice has somebody to be refused. */
let alice: CustomerAccount;
let bob: CustomerAccount;
let aliceCookie: string;

beforeAll(async () => {
  pool = createPool(config.TEST_DATABASE_URL);
  db = createDb(pool);

  await resetDatabase(db);
  await createSystemAccount(db);

  alice = await createCustomerAccount(db);
  bob = await createCustomerAccount(db);
  await fundAccount(db, alice, 100_000n);
  await fundAccount(db, bob, 100_000n);

  app = await buildApp(db, { sessionSecret: config.SESSION_SECRET });
  aliceCookie = await signIn(app, alice.email);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

test("a user cannot read another user's account", async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/accounts/${bob.accountId}/transactions`,
    headers: { cookie: aliceCookie },
  });

  expect(response.statusCode).toBe(404);
  expect(response.json().error.code).toBe('account_not_found');

  // The same request for her own account works, so the 404 is about ownership
  // and not about the route being broken.
  const own = await app.inject({
    method: 'GET',
    url: `/api/accounts/${alice.accountId}/transactions`,
    headers: { cookie: aliceCookie },
  });
  expect(own.statusCode).toBe(200);
  expect(own.json().entries.length).toBeGreaterThan(0);
});

test('a user cannot withdraw from an account they do not own', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/accounts/${bob.accountId}/withdrawals`,
    headers: { cookie: aliceCookie },
    payload: { amountMinor: '5000' },
  });

  expect(response.statusCode).toBe(404);
  expect(response.json().error.code).toBe('account_not_found');

  // Refused before any money moved.
  const bobAccounts = await app.inject({
    method: 'GET',
    url: '/api/accounts',
    headers: { cookie: await signIn(app, bob.email) },
  });
  expect(bobAccounts.json().accounts[0].balanceMinor).toBe('100000');
});

test('a user can transfer to an account they do not own', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/transfers',
    headers: { cookie: aliceCookie, 'idempotency-key': 'route-test-transfer' },
    payload: {
      fromAccountId: alice.accountId,
      toAccountNumber: bob.accountNumber,
      amountMinor: '2500',
    },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().transaction.kind).toBe('transfer');

  const accounts = await app.inject({
    method: 'GET',
    url: '/api/accounts',
    headers: { cookie: aliceCookie },
  });
  expect(accounts.json().accounts[0].balanceMinor).toBe('97500');
});

test('the wrong password is rejected and sets no cookie', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { email: alice.email, password: 'not-the-password' },
  });

  expect(response.statusCode).toBe(401);
  expect(response.headers['set-cookie']).toBeUndefined();
});

/**
 * The only test that exercises the reason the cookie is signed. Without it,
 * "authorization is enforced" rests on a cookie anybody could rewrite.
 */
test('a tampered session cookie is rejected', async () => {
  const forged = `session=${bob.userId}`;

  const response = await app.inject({
    method: 'GET',
    url: '/api/accounts',
    headers: { cookie: forged },
  });

  expect(response.statusCode).toBe(401);
  expect(response.json().error.code).toBe('unauthenticated');
});
