import type { ErrorResponse } from '@banking/shared';

/**
 * A failure the server described in its own error shape. Carrying the code as
 * well as the message means a caller can branch on the condition rather than
 * matching on prose.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The one place a failed response becomes an error, mirroring the single error
 * handler on the server. Nothing else in the client reads `response.ok`.
 *
 * Cookies need no configuration: the Vite proxy makes /api same-origin, and
 * that is fetch's default credentials mode.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    // content-type only when there is a body, because Fastify rejects an empty
    // JSON body and DELETE /api/session sends none.
    headers: init?.body
      ? { 'content-type': 'application/json', ...init.headers }
      : init?.headers,
  });

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json();

  if (!response.ok) {
    const { error } = body as ErrorResponse;
    throw new ApiError(response.status, error.code, error.message, error.issues);
  }

  return body as T;
}
