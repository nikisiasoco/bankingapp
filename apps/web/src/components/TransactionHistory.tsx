import { Button, Flex, Table, Text } from '@radix-ui/themes';

import { useAccountTransactions } from '../api/queries';
import { formatMinor } from '../money';

type Props = {
  accountId: string;
};

export function TransactionHistory({ accountId }: Props) {
  const history = useAccountTransactions(accountId);

  if (history.isPending) return <Text color="gray">Loading transactions…</Text>;
  if (history.error) return <Text color="red">{history.error.message}</Text>;

  const entries = history.data.pages.flatMap((page) => page.entries);

  if (entries.length === 0) return <Text color="gray">No transactions yet.</Text>;

  return (
    <Flex direction="column" gap="3" align="start">
      <Table.Root variant="surface" style={{ width: '100%' }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell className="amount">Amount</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {entries.map((entry) => {
            // Signed from this account's point of view, so the leading minus
            // is the only thing that decides how it reads.
            const outgoing = entry.amountMinor.startsWith('-');

            return (
              <Table.Row key={entry.id}>
                <Table.Cell>{new Date(entry.createdAt).toLocaleString('en-GB')}</Table.Cell>
                <Table.Cell>{entry.description}</Table.Cell>
                <Table.Cell className="amount">
                  <Text color={outgoing ? 'red' : 'green'}>
                    {formatMinor(entry.amountMinor)}
                  </Text>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>

      {history.hasNextPage && (
        <Button
          variant="soft"
          onClick={() => void history.fetchNextPage()}
          loading={history.isFetchingNextPage}
        >
          Load more
        </Button>
      )}
    </Flex>
  );
}
