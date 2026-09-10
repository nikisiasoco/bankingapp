import { Button, Card, Flex, Heading, Text } from '@radix-ui/themes';
import { Link } from 'react-router';

import { usePrimaryAccount } from '../api/queries';
import { formatMinor } from '../money';

export function Home() {
  const { account, isPending, error } = usePrimaryAccount();

  if (isPending) return <Text color="gray">Loading account…</Text>;
  if (error) return <Text color="red">{error.message}</Text>;
  if (!account) return <Text color="gray">You have no account.</Text>;

  return (
    <Card size="4">
      <Flex direction="column" gap="4" align="start">
        <Flex direction="column" gap="1">
          <Text size="2" color="gray">
            Account {account.accountNumber}
          </Text>
          {/* Minor units become readable here and nowhere earlier. */}
          <Heading size="9">{formatMinor(account.balanceMinor)}</Heading>
          <Text size="2" color="gray">
            Available balance
          </Text>
        </Flex>

        <Button asChild size="3">
          <Link to="/payments">Make a payment</Link>
        </Button>
      </Flex>
    </Card>
  );
}
