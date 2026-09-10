import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1),
  /**
   * Signs the session cookie. Sign in is mocked, but the cookie still has to be
   * tamper proof: it names the actor, and every ownership check downstream
   * trusts that name. A short secret is worse than an obvious placeholder,
   * hence the floor.
   */
  SESSION_SECRET: z.string().min(32),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Fails loudly at boot rather than at the first query. Every offending variable
 * is named, so one run tells you everything that is wrong with the environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      const reason = env[name] === undefined ? 'is required but not set' : issue.message;
      return `  ${name}: ${reason}`;
    });
    console.error(`Invalid environment:\n${problems.join('\n')}`);
    console.error('See .env.example for the expected variables.');
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
