import { Button, Callout, Flex, Text, TextField } from '@radix-ui/themes';
import { type FormEvent, useState } from 'react';

import { useTransfer } from '../api/queries';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';
import { parseMajorToMinor } from '../money';

type Props = {
  fromAccountId: string;
};

/**
 * The destination is an account number rather than an id, because a number is
 * the thing one customer can give another. The actor is not expected to own it.
 */
export function TransferForm({ fromAccountId }: Props) {
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const idempotencyKey = useIdempotencyKey();

  const transfer = useTransfer();

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    const amountMinor = parseMajorToMinor(amount);
    if (amountMinor === null) {
      setInvalid('Enter an amount greater than zero, to at most two decimal places');
      return;
    }
    if (toAccountNumber.trim() === '') {
      setInvalid('Enter the destination account number');
      return;
    }
    setInvalid(null);

    transfer.mutate(
      {
        fromAccountId,
        toAccountNumber: toAccountNumber.trim(),
        amountMinor,
        idempotencyKey: idempotencyKey.current(),
      },
      {
        onSuccess: () => {
          idempotencyKey.reset();
          setAmount('');
          setToAccountNumber('');
        },
      },
    );
  }

  // One message at a time. What the user just typed matters more than the
  // server's answer to what they typed before it.
  const message = invalid ?? transfer.error?.message;

  return (
    <form onSubmit={onSubmit}>
      <Flex direction="column" gap="3" align="start">
        <label>
          <Text as="div" size="2" mb="1" color="gray">
            To account number
          </Text>
          <TextField.Root
            value={toAccountNumber}
            onChange={(event) => setToAccountNumber(event.target.value)}
            placeholder="1000000002"
          />
        </label>

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

        <Button type="submit" loading={transfer.isPending}>
          Transfer
        </Button>
      </Flex>
    </form>
  );
}
