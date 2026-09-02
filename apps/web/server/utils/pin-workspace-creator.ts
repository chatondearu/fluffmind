import { getDb, member, memberSyncMeta } from '@fluffmind/db'
import { and, eq } from 'drizzle-orm'

/**
 * Mark the Better Auth organization creator as a manual member so GitHub
 * collaborator sync never treats them as deletable `source=github` rows.
 */
export async function pinWorkspaceCreatorAsManual(
  organizationId: string,
  userId: string,
): Promise<void> {
  const db = getDb()
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1)

  if (!row)
    return

  await db
    .insert(memberSyncMeta)
    .values({
      memberId: row.id,
      source: 'manual',
      localOverride: false,
    })
    .onConflictDoUpdate({
      target: memberSyncMeta.memberId,
      set: {
        source: 'manual',
      },
    })
}
