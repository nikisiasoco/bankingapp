import { eq } from 'drizzle-orm';

import type { DbHandle } from '../../db/client';
import { type User, users } from '../../db/schema';

export async function findUserById(
  handle: DbHandle,
  userId: string,
): Promise<User | undefined> {
  const [user] = await handle.select().from(users).where(eq(users.id, userId)).limit(1);

  return user;
}

/** The whole of our credential check, which is the point of the exercise. */
export async function findUserByEmail(
  handle: DbHandle,
  email: string,
): Promise<User | undefined> {
  const [user] = await handle.select().from(users).where(eq(users.email, email)).limit(1);

  return user;
}
