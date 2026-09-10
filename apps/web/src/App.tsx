import { Button, Container, Flex, Separator, Text } from '@radix-ui/themes';
import { Link, Navigate, Route, Routes } from 'react-router';

import { useMe, useSignOut } from './api/queries';
import { Home } from './screens/Home';
import { Payments } from './screens/Payments';
import { SignIn } from './screens/SignIn';

export function App() {
  const me = useMe();
  const signOut = useSignOut();

  if (me.isPending) return <Text color="gray">Loading…</Text>;

  // useMe turns a 401 into null, so this one check is the whole session gate.
  // Conditional rendering rather than route guards: there is no redirect to
  // follow, and an unauthenticated user cannot reach a screen that would ask
  // for data they do not have.
  if (!me.data) return <SignIn />;

  return (
    <Container size="2" px="4" py="5">
      <Flex justify="between" align="center" gap="4">
        <Flex align="center" gap="4">
          <Text weight="bold" size="4" asChild>
            <Link to="/">Banking</Link>
          </Text>
          <Text size="2" color="gray" asChild>
            <Link to="/payments">Payments</Link>
          </Text>
        </Flex>

        <Flex align="center" gap="3">
          <Text size="2" color="gray">
            {me.data.user.displayName}
          </Text>
          <Button
            variant="soft"
            size="1"
            onClick={() => signOut.mutate()}
            loading={signOut.isPending}
          >
            Sign out
          </Button>
        </Flex>
      </Flex>

      <Separator size="4" my="4" />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Container>
  );
}
