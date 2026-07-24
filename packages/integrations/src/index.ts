// Third-party service clients: GitHub OAuth/API, Git plumbing (clone/pull/commit/push/
// rebase). MCP server lives in apps/web/server/mcp (P5).
//
// GitHub OAuth/API is implemented (P2). MCP stdio + HTTP transports ship in P5.

export { ensureWorkingCopy, commitAndPush, getSyncStatus, pullFromRemote, GitConflictError } from './git'
export type { WorkingCopyConfig, CommitPushOptions, CommitPushResult, SyncStatus, PullFromRemoteResult } from './git'

export { fetchCollaborators, mapGitHubPermission } from './github/collaborators'
export type {
  GitHubCollaborator,
  GitHubCollaboratorPermission,
  WorkspaceMemberPermission,
} from './github/collaborators'

export { syncWorkspaceMembersFromGitHub } from './github/sync'
export type {
  MemberSyncMeta,
  MemberSyncSource,
  SyncWorkspaceMembersDeps,
  SyncWorkspaceMembersOptions,
  SyncWorkspaceMembersResult,
  WorkspaceMember,
} from './github/sync'

export { createInstallationToken } from './github/app-auth'
export type { GitHubAppCredentials, InstallationTokenOptions } from './github/app-auth'

export { buildGitHubHttpsRemoteUrl, withGitHubAccessToken } from './github/remote-url'
