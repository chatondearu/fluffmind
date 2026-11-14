import { readJsonBody } from '../../utils/read-json-body'
import {
  requireSyncModeInput,
  setWorkspaceSyncMode,
} from '../../utils/workspace-sync-mode'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../utils/workspace-manage-authority'

interface PatchSyncModeBody {
  workspaceId?: unknown
  syncMode?: unknown
}

/**
 * PATCH /api/workspaces/sync-mode
 * Body: { workspaceId, syncMode: "git-live" | "mesh-live" }
 *
 * Opt-in to mesh-live or rollback to git-live. Enum is mutually exclusive
 * (never both live writers). Auth-off: use SYNC_MODE env only — this route
 * requires workspace manage permission (session).
 */
export default defineEventHandler(async (event) => {
  const body = await readJsonBody<PatchSyncModeBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)
  const syncMode = requireSyncModeInput(body.syncMode)

  const result = await setWorkspaceSyncMode(authority.workspaceId, syncMode)
  await auditAdminAction(authority, 'workspace.syncMode.patch', {
    syncMode: result.syncMode,
    previousSyncMode: result.previousSyncMode,
  })

  return result
})
