import { unlinkWorkspaceGithubSync } from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'
import { invalidateBootstrap } from '../../../vault/sync'

interface UnlinkWorkspaceGitHubBody {
  workspaceId?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<UnlinkWorkspaceGitHubBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const state = await unlinkWorkspaceGithubSync(authority.workspaceId)
  invalidateBootstrap(authority.workspaceId)

  await auditAdminAction(authority, 'workspace.github.unlink')

  return state
})
