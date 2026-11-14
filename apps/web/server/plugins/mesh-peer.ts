import { isAuthEnabled } from '../utils/auth'
import { ensureMeshTcpHub, ensureWorkspaceMeshPeer } from '../vault/mesh-peer-bootstrap'

/**
 * When MESH_TCP_PORT is set, start the localhost hub and bind the default
 * workspace peer (auth-off). Auth-on peers connect lazily on first mesh write.
 */
export default defineNitroPlugin(() => {
  if (!process.env.MESH_TCP_PORT?.trim())
    return

  ensureMeshTcpHub().catch((error: unknown) => {
    console.error('[mesh] failed to start TCP hub:', error)
  })

  if (!isAuthEnabled()) {
    ensureWorkspaceMeshPeer('default').catch((error: unknown) => {
      console.error('[mesh] failed to bind default peer:', error)
    })
  }
})
