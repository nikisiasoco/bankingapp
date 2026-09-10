import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests talk to the real db_test instance, so they share one connection
    // pool per file and must not race each other over the same rows.
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    setupFiles: ['src/test/setup.ts'],
    env: { NODE_ENV: 'test' },
  },
});
