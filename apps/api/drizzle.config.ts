import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Migrations are generated as SQL and applied by src/db/migrate.ts, so
  // drizzle-kit never needs to touch a live database here.
  strict: true,
  verbose: true,
});
