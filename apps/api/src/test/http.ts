import type { FastifyInstance } from 'fastify';

/** The shared demo password, mirroring DEMO_PASSWORD in src/auth.ts. */
export const TEST_PASSWORD = 'password';

/**
 * Signs in and hands back the cookie header for later injects, which is the
 * closest a test gets to being a browser. Returns the raw `set-cookie` value so
 * the signature travels intact: re-signing it here would test the helper rather
 * than the server.
 */
export async function signIn(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { email, password: TEST_PASSWORD },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Sign in for ${email} returned ${response.statusCode}`);
  }

  const cookie = response.headers['set-cookie'];
  const header = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!header) throw new Error('Sign in set no cookie');

  // Only the name=value pair; the attributes are for a browser, not a request.
  return header.split(';')[0]!;
}
