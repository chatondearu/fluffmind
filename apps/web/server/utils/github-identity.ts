import { account, getDb, user } from '@fluffmind/db'
import { and, eq, or, sql } from 'drizzle-orm'

/**
 * Map a GitHub collaborator/invitee to a Fluffmind user id.
 * Better Auth typically stores the numeric GitHub user id in `account.accountId`;
 * some flows also store the login — match both, then fall back to `user.name`.
 */
export async function resolveUserIdByGithubIdentity(
  githubLogin: string,
  githubUserId?: string | null,
): Promise<string | null> {
  const db = getDb()
  const login = githubLogin.trim()
  if (!login && !githubUserId)
    return null

  const identityMatchers = []
  if (login)
    identityMatchers.push(sql`lower(${account.accountId}) = lower(${login})`)
  if (githubUserId)
    identityMatchers.push(eq(account.accountId, githubUserId))

  if (identityMatchers.length > 0) {
    const [accountMatch] = await db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'github'), or(...identityMatchers)))
      .limit(1)
    if (accountMatch?.userId)
      return accountMatch.userId
  }

  if (!login)
    return null

  const [userMatch] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.name}) = lower(${login})`)
    .limit(1)

  return userMatch?.id ?? null
}
