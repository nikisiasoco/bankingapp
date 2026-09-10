import type {
  AccountsResponse,
  MeResponse,
  TransactionResponse,
  TransactionsPage,
} from '@banking/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { ApiError, request } from './client';

/**
 * Two prefixes are all the cache needs. Everything a money movement can change
 * hangs off ['accounts'], so one invalidation refreshes the balance list and
 * every transaction history at once.
 */
const keys = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  transactions: (accountId: string) => ['accounts', accountId, 'transactions'] as const,
};

const PAGE_SIZE = 25;

/**
 * A 401 here is an answer, not a failure: it means nobody is signed in. Turning
 * it into null rather than an error makes the session gate a plain `if (!me)`.
 */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await request<MeResponse>('/api/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: () => request<AccountsResponse>('/api/accounts'),
  });
}

/**
 * A customer has exactly one account, so every screen wants the same thing
 * from the list. The API still returns an array, and the schema still permits
 * more than one, because nothing about a ledger requires the restriction.
 */
export function usePrimaryAccount() {
  const accounts = useAccounts();

  return {
    ...accounts,
    account: accounts.data?.accounts[0] ?? null,
  };
}

/** Paged by ledger entry id, so a page cannot shift under someone mid-scroll. */
export function useAccountTransactions(accountId: string) {
  return useInfiniteQuery({
    queryKey: keys.transactions(accountId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam !== undefined) query.set('cursor', pageParam);

      return request<TransactionsPage>(`/api/accounts/${accountId}/transactions?${query}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export type Credentials = {
  email: string;
  password: string;
};

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: Credentials) =>
      request<MeResponse>('/api/session', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: (me) => {
      queryClient.setQueryData(keys.me, me);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => request<void>('/api/session', { method: 'DELETE' }),
    onSuccess: () => {
      // Everything cached belonged to the user who just left.
      queryClient.clear();
    },
  });
}

/** What every money movement needs from a form. */
export type MovementInput = {
  amountMinor: string;
  idempotencyKey: string;
};

function movementRequest(
  path: string,
  body: Record<string, string>,
  idempotencyKey: string,
): Promise<TransactionResponse> {
  return request<TransactionResponse>(path, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

export function useDeposit(accountId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amountMinor, idempotencyKey }: MovementInput) =>
      movementRequest(`/api/accounts/${accountId}/deposits`, { amountMinor }, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}

export function useWithdraw(accountId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amountMinor, idempotencyKey }: MovementInput) =>
      movementRequest(
        `/api/accounts/${accountId}/withdrawals`,
        { amountMinor },
        idempotencyKey,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}

export type TransferInput = MovementInput & {
  fromAccountId: string;
  toAccountNumber: string;
};

export function useTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fromAccountId,
      toAccountNumber,
      amountMinor,
      idempotencyKey,
    }: TransferInput) =>
      movementRequest(
        '/api/transfers',
        { fromAccountId, toAccountNumber, amountMinor },
        idempotencyKey,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts }),
  });
}
