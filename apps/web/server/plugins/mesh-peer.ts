import { getDb, workspaceConfig } from '@fluffmind/db'
import { eq } from 'drizzle-orm'
import { isAuthEnabled } from '../utils/auth'
import { isDaemonConfigured, syncWorkspaceDaemonConfig } from '../vault/mesh-peer-bootstrap'

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

  if (!isAuthEnabled()) {
    void sync('default')
    return
  }

  getDb()
    .select({ id: workspaceConfig.organizationId })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.syncMode, 'mesh-live'))
    .then(rows => Promise.all(rows.map(row => sync(row.id))))
    .catch((error: unknown) => {
      console.error('[mesh] failed to list mesh-live workspaces:', error)
    })
})
