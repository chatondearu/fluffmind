export interface WorkspaceConfig {
  path: string
  remoteUrl?: string
  branch: string
}

/**
 * Resolves a workspace id to its working-copy config. A single workspace, sourced from
 * env vars, until real multi-workspace resolution (Postgres-backed) lands in P2 — the
 * `workspaceId` parameter is kept to match the target signature from DESIGN.md rather
 * than break it later.
 */
export function resolveWorkspaceConfig(_workspaceId: string): WorkspaceConfig {
  const config = workspaceConfigFromEnv()
  if (!config) throw new Error('VAULT_PATH environment variable is not set')
  return config
}

export function workspaceConfigFromEnv(): WorkspaceConfig | null {
  const path = process.env.VAULT_PATH
  if (!path) return null
  return {
    path,
    remoteUrl: process.env.GIT_REMOTE_URL || undefined,
    branch: process.env.GIT_BRANCH || 'main'
  }
}
