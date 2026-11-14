import { getWorkspaceSyncMode } from '../../utils/workspace-sync-mode'
import {
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../utils/workspace-manage-authority'

/**
 * GET /api/workspaces/sync-mode?workspaceId=
 * Auth-on: workspace manage (owner or instance admin).
 * Auth-off: rejected by requireSession — set SYNC_MODE env instead.
 */
export default defineEventHandler(async (event) => {
  const workspaceId = parseWorkspaceId(getQuery(event).workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)
  const syncMode = await getWorkspaceSyncMode(authority.workspaceId)
  return { syncMode }
})
