import { getDb, workspaceConfig } from '@fluffmind/db'
import { eq } from 'drizzle-orm'
import { isAuthEnabled } from '../utils/auth'
import { detachStaleDaemonVaults, isDaemonConfigured, syncWorkspaceDaemonConfig } from '../vault/mesh-peer-bootstrap'
import { resolveWorkspaceConfig } from '../vault/workspace'

/**
 * When FLUFFMIND_DAEMON_URL is set, push vault config to the daemon and bind a mesh
 * transport: auth-off → the `default` workspace; auth-on → every mesh-live workspace
 * in Postgres (others bind lazily on their first mesh write).
 */
export default defineNitroPlugin(() => {
  if (!isDaemonConfigured())
    return

  const sync = (workspaceId: string) =>
    syncWorkspaceDaemonConfig(workspaceId).catch((error: unknown) => {
      console.error(`[mesh] failed to sync workspace ${workspaceId} with the daemon:`, error)
    })

  const reconcile = (meshLive: Set<string>) =>
    detachStaleDaemonVaults(meshLive).catch((error: unknown) => {
      console.error('[mesh] failed to detach stale daemon vaults:', error)
    })

  if (!isAuthEnabled()) {
    void sync('default')
      .then(() => resolveWorkspaceConfig('default'))
      .then(config => reconcile(new Set(config.syncMode === 'mesh-live' ? ['default'] : [])))
      .catch(() => {})
    return
  }

  getDb()
    .select({ id: workspaceConfig.organizationId })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.syncMode, 'mesh-live'))
    .then(async (rows) => {
      await Promise.all(rows.map(row => sync(row.id)))
      await reconcile(new Set(rows.map(row => row.id)))
    })
    .catch((error: unknown) => {
      console.error('[mesh] failed to list mesh-live workspaces:', error)
    })
})
