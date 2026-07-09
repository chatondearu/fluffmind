// Third-party service clients: GitHub OAuth/API, Git plumbing (clone/pull/commit/push/
// rebase), MCP SDK wrapper. See the PRD's "packages/integrations" section.
//
// GitHub OAuth/API and the MCP SDK wrapper aren't implemented yet (P2/P5) — the Git
// plumbing (writeToWorkspace's underlying primitives) is the P1 spike.

export { ensureWorkingCopy, commitAndPush, getSyncStatus, GitConflictError } from './git.ts'
export type { WorkingCopyConfig, CommitPushOptions, CommitPushResult, SyncStatus } from './git.ts'

export { fetchCollaborators, mapGitHubPermission } from './github/collaborators.ts'
export type {
  GitHubCollaborator,
  GitHubCollaboratorPermission,
  WorkspaceMemberPermission,
} from './github/collaborators.ts'

export { syncWorkspaceMembersFromGitHub } from './github/sync.ts'
export type {
  MemberSyncMeta,
  MemberSyncSource,
  SyncWorkspaceMembersDeps,
  SyncWorkspaceMembersOptions,
  SyncWorkspaceMembersResult,
  WorkspaceMember,
} from './github/sync.ts'
