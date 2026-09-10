import { Box, Button, Callout, Card, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import { type FormEvent, useState } from 'react';

import { useSignIn } from '../api/queries';

/**
 * Shown as a hint because authentication is mocked and there is no endpoint
 * that lists users. A real deployment would print none of this.
 */
const DEMO_EMAILS = ['alice@example.com', 'bob@example.com', 'carol@example.com'];

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useSignIn();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    signIn.mutate({ email: email.trim(), password });
  }

  return (
    <Box style={{ maxWidth: '24rem', margin: '6rem auto', padding: '0 1rem' }}>
      <Card size="3">
        <form onSubmit={onSubmit}>
          <Flex direction="column" gap="4">
            <Heading size="6">Sign in</Heading>

            <label>
              <Text as="div" size="2" mb="1" color="gray">
                Email
              </Text>
              <TextField.Root
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alice@example.com"
              />
            </label>

            <label>
              <Text as="div" size="2" mb="1" color="gray">
                Password
              </Text>
              <TextField.Root
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {signIn.error && (
              <Callout.Root color="red" size="1">
                <Callout.Text>{signIn.error.message}</Callout.Text>
              </Callout.Root>
            )}

            <Button type="submit" loading={signIn.isPending}>
              Sign in
            </Button>

            <Text size="1" color="gray">
              Demo users: {DEMO_EMAILS.join(', ')}. The password is “password”.
            </Text>
          </Flex>
        </form>
      </Card>
    </Box>
  );
}
