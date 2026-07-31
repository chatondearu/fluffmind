import { getDb, member, organization, session } from '@fluffmind/db'
import { and, eq, isNotNull, notInArray } from 'drizzle-orm'

export interface RepairWorkspaceSessionResult {
  workspaceId: string | null
  repaired: boolean
}

/**
 * Clears stale `session.activeOrganizationId` values for a user (org row gone),
 * then binds the current session to a valid membership when needed.
 */
export async function repairWorkspaceSession(options: {
  userId: string
  sessionId: string
}): Promise<RepairWorkspaceSessionResult> {
  const { userId, sessionId } = options
  const db = getDb()

  const orgRows = await db.select({ id: organization.id }).from(organization)
  const orgIds = orgRows.map(row => row.id)

  let clearedStale = false
  if (orgIds.length === 0) {
    const cleared = await db.update(session)
      .set({ activeOrganizationId: null })
      .where(and(eq(session.userId, userId), isNotNull(session.activeOrganizationId)))
      .returning({ id: session.id })
    clearedStale = cleared.length > 0
  }
  else {
    const cleared = await db.update(session)
      .set({ activeOrganizationId: null })
      .where(and(
        eq(session.userId, userId),
        isNotNull(session.activeOrganizationId),
        notInArray(session.activeOrganizationId, orgIds),
      ))
      .returning({ id: session.id })
    clearedStale = cleared.length > 0
  }

  const [current] = await db
    .select({
      id: session.id,
      activeOrganizationId: session.activeOrganizationId,
    })
    .from(session)
    .where(eq(session.id, sessionId))
    .limit(1)

  if (!current) {
    return { workspaceId: null, repaired: clearedStale }
  }

  let targetId = current.activeOrganizationId

  if (targetId) {
    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.organizationId, targetId), eq(member.userId, userId)))
      .limit(1)

    if (!membership)
      targetId = null
  }

  if (!targetId) {
    const [firstMembership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .limit(1)

    targetId = firstMembership?.organizationId ?? null
  }

  if (targetId && targetId !== current.activeOrganizationId) {
    await db.update(session)
      .set({ activeOrganizationId: targetId })
      .where(eq(session.id, sessionId))

    return { workspaceId: targetId, repaired: true }
  }

  return {
    workspaceId: targetId,
    repaired: clearedStale,
  }
}
