import { getDb, member } from '@fluffmind/db'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'

import { requireSession } from '../../../utils/auth'
import { createWorkspaceAgentToken } from '../../../utils/agent-tokens'
import { readJsonBody } from '../../../utils/read-json-body'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

async function requireOwnerSession(event: H3Event, workspaceId: string) {
  const session = await requireSession(event)
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
      message: 'Creating agent tokens requires owner role.',
    })
  }

  return session
}

export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  const session = await requireOwnerSession(event, workspaceId)

  const body = await readJsonBody<{ name?: string, scope?: string }>(event)
  const name = typeof body.name === 'string' ? body.name : ''
  const scope = body.scope === 'read' || body.scope === 'write' ? body.scope : null
  if (!scope) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid scope',
      message: 'Scope must be "read" or "write".',
    })
  }

  return createWorkspaceAgentToken({
    organizationId: workspaceId,
    name,
    scope,
    createdByUserId: session.user.id,
  })
})
