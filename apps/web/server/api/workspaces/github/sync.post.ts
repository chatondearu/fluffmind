import {
  type LocalOverrideInput,
  getWorkspaceGitHubSyncState,
  syncWorkspaceMembersForOrganization,
} from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'

interface SyncWorkspaceGitHubBody {
  workspaceId?: unknown
  run?: boolean
  localOverrides?: Array<{
    memberId?: string
    localOverride?: boolean
  }>
}

function normalizeLocalOverrides(input: SyncWorkspaceGitHubBody['localOverrides']): LocalOverrideInput[] {
  if (!Array.isArray(input))
    return []

  const merged = new Map<string, boolean>()
  for (const item of input) {
    const memberId = typeof item.memberId === 'string' ? item.memberId.trim() : ''
    if (!memberId)
      continue
    merged.set(memberId, Boolean(item.localOverride))
  }

  return Array.from(merged, ([memberId, localOverride]) => ({ memberId, localOverride }))
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<SyncWorkspaceGitHubBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const run = body.run !== false
  const localOverrides = normalizeLocalOverrides(body.localOverrides)

  if (!run)
    return getWorkspaceGitHubSyncState(authority.workspaceId)

  try {
    const result = await syncWorkspaceMembersForOrganization(authority.workspaceId, localOverrides)
    await auditAdminAction(authority, 'workspace.github.sync')
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub sync failed.'
    throw createError({
      statusCode: 400,
      statusMessage: 'GitHub sync failed',
      message,
    })
  }
})
