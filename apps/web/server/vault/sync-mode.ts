/**
 * Live sync mode for a vault/workspace (PRD-042 / ADR-016…018).
 * - git-live: server Git commit/push is the live write path (legacy ADR-002)
 * - mesh-live: peer/mesh apply is live; Git is export/backup only
 */
export type SyncMode = 'git-live' | 'mesh-live'

export const DEFAULT_SYNC_MODE: SyncMode = 'git-live'

/** Parse unknown input; invalid/missing → default git-live. */
export function parseSyncMode(value: unknown): SyncMode {
  if (value === 'mesh-live' || value === 'git-live')
    return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'mesh-live' || normalized === 'mesh')
      return 'mesh-live'
    if (normalized === 'git-live' || normalized === 'git')
      return 'git-live'
  }
  return DEFAULT_SYNC_MODE
}

/** Env override for auth-off / solo (`SYNC_MODE`). */
export function syncModeFromEnv(): SyncMode {
  return parseSyncMode(process.env.SYNC_MODE)
}
