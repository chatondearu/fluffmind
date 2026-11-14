import { getDb, workspaceConfig } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import {
  type SyncMode,
  DEFAULT_SYNC_MODE,
  parseSyncMode,
} from '../vault/sync-mode'

export type { SyncMode }
export { DEFAULT_SYNC_MODE, parseSyncMode }

/**
 * Strict parse for migrate/opt-in API input.
 * Only exact enum values — aliases and silent defaults belong to parseSyncMode (reads).
 * Mutual exclusion of live writers is the enum itself (git-live | mesh-live).
 */
export function requireSyncModeInput(value: unknown): SyncMode {
  if (value === 'git-live' || value === 'mesh-live')
    return value

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid payload',
    message: '"syncMode" must be "git-live" or "mesh-live" (mutually exclusive live writers).',
  })
}

export async function getWorkspaceSyncMode(organizationId: string): Promise<SyncMode> {
  const db = getDb()
  const [row] = await db
    .select({ syncMode: workspaceConfig.syncMode })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, organizationId))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace config not found',
      message: `No workspace configuration found for "${organizationId}".`,
    })
  }

  return parseSyncMode(row.syncMode)
}

/**
 * Persist sync mode for an auth-on workspace.
 * Rollback: PATCH again with the other value (git-live ↔ mesh-live).
 * Auth-off / solo: use env SYNC_MODE only — this helper requires Postgres.
 */
export async function setWorkspaceSyncMode(
  organizationId: string,
  syncMode: SyncMode,
): Promise<{ syncMode: SyncMode, previousSyncMode: SyncMode }> {
  const previousSyncMode = await getWorkspaceSyncMode(organizationId)
  if (previousSyncMode === syncMode)
    return { syncMode, previousSyncMode }

  const db = getDb()
  await db
    .update(workspaceConfig)
    .set({ syncMode })
    .where(eq(workspaceConfig.organizationId, organizationId))

  return { syncMode, previousSyncMode }
}
