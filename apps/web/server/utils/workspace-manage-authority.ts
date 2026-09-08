import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDb, insertAdminAudit, member } from '@fluffmind/db'

import { requireAdminInstance } from './admin'
import { requireSession } from './auth'

export type WorkspaceManageActor = 'admin' | 'owner'

export interface WorkspaceManageAuthority {
  workspaceId: string
  actor: WorkspaceManageActor
  session: Awaited<ReturnType<typeof requireSession>>
}

export function parseWorkspaceId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'workspaceId is required.',
    })
  }
  return raw.trim()
}

/**
 * Prefer query `workspaceId`, then JSON body field (for clients that still send a body).
 */
export function resolveWorkspaceIdFromQueryOrBody(
  queryWorkspaceId: unknown,
  bodyWorkspaceId: unknown,
): string {
  return parseWorkspaceId(
    typeof queryWorkspaceId === 'string' && queryWorkspaceId.trim()
      ? queryWorkspaceId
      : bodyWorkspaceId,
  )
}

export async function requireWorkspaceManageAuthority(
  event: H3Event,
  workspaceId: string,
): Promise<WorkspaceManageAuthority> {
  const session = await requireSession(event)

  try {
    await requireAdminInstance(event)
    return { workspaceId, actor: 'admin', session }
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    if (statusCode !== 403)
      throw error
  }

  const db = getDb()
  const [workspaceMember] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember || workspaceMember.role !== 'owner') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Workspace manage authority required.',
    })
  }

  return { workspaceId, actor: 'owner', session }
}

/** Instance admin or any member of the workspace (read access). */
export async function requireWorkspaceMembership(
  event: H3Event,
  workspaceId: string,
): Promise<{ workspaceId: string, session: Awaited<ReturnType<typeof requireSession>> }> {
  const session = await requireSession(event)

  try {
    await requireAdminInstance(event)
    return { workspaceId, session }
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    if (statusCode !== 403)
      throw error
  }

  const db = getDb()
  const [workspaceMember] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Workspace membership required.',
    })
  }

  return { workspaceId, session }
}

export async function auditAdminAction(
  authority: WorkspaceManageAuthority,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (authority.actor !== 'admin')
    return

  await insertAdminAudit({
    actorUserId: authority.session.user.id,
    actor: 'admin',
    action,
    targetWorkspaceId: authority.workspaceId,
    detail,
  })
}
