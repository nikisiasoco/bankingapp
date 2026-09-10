import { useRef } from 'react';

export type IdempotencyKey = {
  /** Mints on the first attempt, then returns the same value on every retry. */
  current: () => string;
  /** Call on success: the next submission is a new operation, not a retry. */
  reset: () => void;
};

/**
 * One key per submission, reused across retries of that submission. If a
 * response is lost in flight, resubmitting sends the same key and the server
 * returns the original transaction instead of moving the money twice.
 *
 * A ref rather than state, deliberately: minting a key must not re-render, and
 * the value has to survive the render caused by the mutation settling.
 */
export function useIdempotencyKey(): IdempotencyKey {
  const key = useRef<string | null>(null);

  return {
    current: () => (key.current ??= crypto.randomUUID()),
    reset: () => {
      key.current = null;
    },
  };
}
