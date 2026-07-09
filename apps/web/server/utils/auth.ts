import { auth } from '@fluffmind/db'
import type { H3Event } from 'h3'
import { resolveActiveWorkspaceId } from '../vault/workspace'

export function isAuthEnabled(): boolean {
  if (process.env.AUTH_DISABLED === 'true')
    return false
  return Boolean(process.env.DATABASE_URL)
}

export async function getSession(event: H3Event) {
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  return session
}

export async function requireSession(event: H3Event) {
  if (!isAuthEnabled())
    return null

  const session = await getSession(event)

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Authentication is required for this endpoint.',
    })
  }

  return session
}

type WorkspacePermissionAction = {
  note: 'read' | 'write'
  workspace: 'manage'
}

type WorkspacePermissionResource = keyof WorkspacePermissionAction

type PermissionActionFor<Resource extends WorkspacePermissionResource> = WorkspacePermissionAction[Resource]

export async function requireWorkspacePermission<Resource extends WorkspacePermissionResource>(
  event: H3Event,
  resource: Resource,
  action: PermissionActionFor<Resource>,
): Promise<string> {
  const workspaceId = await resolveActiveWorkspaceId(event)

  if (!isAuthEnabled())
    return workspaceId

  await requireSession(event)

  const hasPermission = await auth.api.hasPermission({
    headers: event.headers,
    body: {
      organizationId: workspaceId,
      permissions: {
        [resource]: [action],
      },
    },
  })

  if (!hasPermission) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: `Missing required permission: ${resource}:${action}.`,
    })
  }

  return workspaceId
}
