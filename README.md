# Banking

A small banking application. A user signs in, sees their balance, and deposits,
withdraws or transfers money to another account. Everything runs locally.

Money is held as a double-entry ledger. Every movement writes two rows that sum
to zero, and `accounts.balance_minor` is a cached projection of those rows,
written only in the same transaction as the entries that justify it.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node | 22 | Pinned by `.nvmrc`, enforced by `engines` |
| npm | 10 | Ships with Node 22 |
| Docker | with the `docker compose` plugin | Runs both PostgreSQL 17 instances |

Verified on Node 22.23.2, npm 10.9.8, Docker 29.4.0, Compose 5.1.2.

**Node 22 is required, not merely recommended.** Every script passes
`--env-file-if-exists`, which is a Node 22 flag. On Node 20 you will get:

```
bad option: --env-file-if-exists=../../.env
```

If you see that, you are on the wrong Node. Run `nvm use` in the repo root.

## Setup

```bash
nvm use                 # reads .nvmrc, selects Node 22
npm install             # one install covers all three workspaces
cp .env.example .env
```

Then give `SESSION_SECRET` a real value, because it signs the session cookie:

```bash
openssl rand -hex 32
```

Configuration is validated by Zod at boot. If a variable is missing or
malformed the process exits and names it, rather than failing later with
something unrelated.

```bash
npm run setup
```

That does four things in order: starts the containers and waits for both
databases to pass their health checks, migrates the development database,
migrates the test database, then seeds.

## Running it

```bash
npm run dev
```

The API listens on `http://127.0.0.1:3000` and Vite serves the SPA on
`http://localhost:5173`.

**Open 5173, not 3000.** Vite proxies `/api` through to the API, which keeps the
browser on a single origin. That is what lets the `httpOnly` session cookie work
without any CORS configuration.

## Signing in

Authentication is deliberately mocked. All three seeded users share the
password `password`.

| Email | Account | Opening balance |
| --- | --- | --- |
| alice@example.com | 1000000001 | £2,500.00 |
| bob@example.com | 1000000002 | £1,200.50 |
| carol@example.com | 1000000003 | £750.25 |

Sign in as Alice and transfer to `1000000002` to see money move between two
customers.

There is also a system account, `0000000000`. It is the counterparty for every
deposit and withdrawal, which is what keeps those operations double-entry rather
than money appearing from nowhere. It is the one account allowed to hold a
negative balance, because it represents the world outside the bank.

## Tests

```bash
npm test        # Vitest, against the real test database
npm run typecheck
```

The tests run against PostgreSQL rather than a mock, so the containers must be
up. They use the `db_test` database on port 5434, whose data directory is a
tmpfs, so it is disposable and resets with the container. The development
database is never touched by the test suite.

The files that assert global properties truncate the tables first, so those
assertions run against known data rather than leftovers. Two of the tests are
whole-database invariants: that every account's cached balance equals the sum of
its ledger entries, and that every row in `ledger_entries` sums to exactly zero.

## Project layout

```
apps/
  api/          Fastify API, Drizzle schema, migrations and seed
    src/
      modules/  accounts, ledger, session, users
      db/       schema, client, migrate, seed
  web/          React SPA
    src/
      screens/    Home, Payments, SignIn
      components/ forms and transaction history
      api/        fetch wrapper and TanStack Query hooks
packages/
  shared/       Zod request schemas and response types, used by both
docker-compose.yml
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run setup` | Containers up, migrate both databases, seed |
| `npm run dev` | API and web together |
| `npm run dev:api` | API only, on 3000 |
| `npm run dev:web` | SPA only, on 5173 |
| `npm test` | Vitest against the test database |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply migrations to the development database |
| `npm run db:migrate:test` | Apply migrations to the test database |
| `npm run db:seed` | Seed. Idempotent, so it is safe to re-run |

## API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/session` | `{ email, password }`, sets the session cookie |
| DELETE | `/api/session` | Clears the cookie |
| GET | `/api/me` | The signed-in user |
| GET | `/api/accounts` | The caller's accounts only |
| GET | `/api/accounts/:id/transactions` | Paginated by ledger entry id |
| POST | `/api/accounts/:id/deposits` | `{ amountMinor }` |
| POST | `/api/accounts/:id/withdrawals` | `{ amountMinor }` |
| POST | `/api/transfers` | `{ fromAccountId, toAccountNumber, amountMinor }` |

The three write endpoints accept an optional `Idempotency-Key` header. Replaying
a request with the same key returns the original transaction rather than moving
the money twice.

Amounts cross the wire as decimal strings of minor units, so `"1234"` is
£12.34. JSON has no bigint, and an IEEE double silently loses pennies above
2^53, so money is never a JSON number anywhere in this codebase.

Every failure uses one shape:

```json
{ "error": { "code": "insufficient_funds", "message": "Insufficient funds" } }
```

Validation failures add an `issues` array naming the offending fields.