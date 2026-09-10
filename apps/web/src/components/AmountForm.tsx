import { Button, Callout, Flex, Text, TextField } from '@radix-ui/themes';
import { type FormEvent, useState } from 'react';

import { useDeposit, useWithdraw } from '../api/queries';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';
import { parseMajorToMinor } from '../money';

type Props = {
  accountId: string;
  movement: 'deposit' | 'withdrawal';
};

/**
 * One form for both deposit and withdrawal, which differ only by endpoint and
 * label. That mirrors the server, where both are thin wrappers over the same
 * transfer with the system account as counterparty.
 */
export function AmountForm({ accountId, movement }: Props) {
  const [amount, setAmount] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const idempotencyKey = useIdempotencyKey();

  // Hooks cannot be called conditionally, so both exist and we pick one. They
  // are only useMutation calls, so the unused one costs nothing.
  const depositMutation = useDeposit(accountId);
  const withdrawMutation = useWithdraw(accountId);
  const mutation = movement === 'deposit' ? depositMutation : withdrawMutation;

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    const amountMinor = parseMajorToMinor(amount);
    if (amountMinor === null) {
      setInvalid('Enter an amount greater than zero, to at most two decimal places');
      return;
    }
    setInvalid(null);

    mutation.mutate(
      // current() mints on the first attempt and returns the same key if the
      // user submits again after a failure.
      { amountMinor, idempotencyKey: idempotencyKey.current() },
      {
        onSuccess: () => {
          // A new key for the next movement: that one is not a retry.
          idempotencyKey.reset();
          setAmount('');
        },
      },
    );
  }

  // One message at a time. What the user just typed matters more than the
  // server's answer to what they typed before it.
  const message = invalid ?? mutation.error?.message;

  return (
    <form onSubmit={onSubmit}>
      <Flex direction="column" gap="3" align="start">
        <label>
          <Text as="div" size="2" mb="1" color="gray">
            Amount
          </Text>
          <TextField.Root
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="12.34"
            inputMode="decimal"
          />
        </label>

        {message && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{message}</Callout.Text>
          </Callout.Root>
        )}

        <Button type="submit" loading={mutation.isPending}>
          {movement === 'deposit' ? 'Deposit' : 'Withdraw'}
        </Button>
      </Flex>
    </form>
  );
}
