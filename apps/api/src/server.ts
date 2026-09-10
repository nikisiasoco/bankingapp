import { buildApp } from './app';
import { config } from './config';
import { createDb, createPool } from './db/client';

const pool = createPool(config.DATABASE_URL);
const app = await buildApp(createDb(pool), {
  sessionSecret: config.SESSION_SECRET,
  logLevel: config.LOG_LEVEL,
});

/** Finish in-flight requests, then let go of the connections. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}

await app.listen({ port: config.PORT, host: '127.0.0.1' });
