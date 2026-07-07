// Third-party service clients: GitHub OAuth/API, Git plumbing (clone/pull/commit/push/
// rebase), MCP SDK wrapper. See the PRD's "packages/integrations" section.
//
// GitHub OAuth/API and the MCP SDK wrapper aren't implemented yet (P2/P5) — the Git
// plumbing (writeToWorkspace's underlying primitives) is the P1 spike.

export { ensureWorkingCopy, commitAndPush, GitConflictError } from './git'
export type { WorkingCopyConfig, CommitPushOptions, CommitPushResult } from './git'
