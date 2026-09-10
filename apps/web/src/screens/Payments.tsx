import { Box, Card, Flex, Heading, Tabs, Text } from '@radix-ui/themes';

import { usePrimaryAccount } from '../api/queries';
import { AmountForm } from '../components/AmountForm';
import { TransactionHistory } from '../components/TransactionHistory';
import { TransferForm } from '../components/TransferForm';
import { formatMinor } from '../money';

export function Payments() {
  const { account, isPending, error } = usePrimaryAccount();

  if (isPending) return <Text color="gray">Loading account…</Text>;
  if (error) return <Text color="red">{error.message}</Text>;
  if (!account) return <Text color="gray">You have no account.</Text>;

  return (
    <Flex direction="column" gap="5">
      <Flex justify="between" align="baseline">
        <Heading size="6">Payments</Heading>
        <Text size="2" color="gray">
          Balance {formatMinor(account.balanceMinor)}
        </Text>
      </Flex>

      <Card size="3">
        {/* The three actions are mutually exclusive, so only one is on screen
            at a time. Switching away unmounts the form, which abandons its
            idempotency key along with the input it belonged to. */}
        <Tabs.Root defaultValue="transfer">
          <Tabs.List>
            <Tabs.Trigger value="transfer">Transfer</Tabs.Trigger>
            <Tabs.Trigger value="deposit">Deposit</Tabs.Trigger>
            <Tabs.Trigger value="withdraw">Withdraw</Tabs.Trigger>
          </Tabs.List>

          <Box pt="4">
            <Tabs.Content value="transfer">
              <TransferForm fromAccountId={account.id} />
            </Tabs.Content>

            <Tabs.Content value="deposit">
              <AmountForm accountId={account.id} movement="deposit" />
            </Tabs.Content>

            <Tabs.Content value="withdraw">
              <AmountForm accountId={account.id} movement="withdrawal" />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Card>

      <Box>
        <Heading size="4" mb="3">
          Transaction history
        </Heading>
        <TransactionHistory accountId={account.id} />
      </Box>
    </Flex>
  );
}
