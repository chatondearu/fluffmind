import { getDb, member } from '@fluffmind/db'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'

import { requireSession } from '../../../utils/auth'
import { getWorkspaceMcpStatus, setWorkspaceMcpEnabled } from '../../../utils/mcp-tokens'
import { readJsonBody } from '../../../utils/read-json-body'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

async function requireOwnerRole(event: H3Event, workspaceId: string): Promise<Awaited<ReturnType<typeof requireSession>>> {
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
      message: 'Managing MCP requires owner role.',
    })
  }

  return session
}

export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  await requireOwnerRole(event, workspaceId)

  const body = await readJsonBody<{ mcpEnabled?: boolean }>(event)
  if (typeof body.mcpEnabled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      message: '"mcpEnabled" boolean is required.',
    })
  }

  await setWorkspaceMcpEnabled(workspaceId, body.mcpEnabled)
  return getWorkspaceMcpStatus(workspaceId)
})
