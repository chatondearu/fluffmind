/**
 * Optional TCP mesh hub + Nuxt peer (MESH_TCP_PORT).
 * shortcut: one hub per process; peer id nuxt:<workspaceId>; upgrade when iroh lands.
 */
import {
  connectTcpMeshPeer,
  startTcpMeshHub,
  type TcpMeshHubHandle,
} from '@fluffmind/integrations'
import { bindWorkspaceMeshTransport } from './mesh-apply'

let hub: TcpMeshHubHandle | null = null
const connecting = new Map<string, Promise<void>>()

function meshTcpPort(): number | null {
  const raw = process.env.MESH_TCP_PORT?.trim()
  if (!raw)
    return null
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
}

function meshTcpHost(): string {
  return process.env.MESH_TCP_HOST?.trim() || '127.0.0.1'
}

/** Start localhost hub when MESH_TCP_LISTEN is not "0" (default: listen). */
export async function ensureMeshTcpHub(): Promise<TcpMeshHubHandle | null> {
  const port = meshTcpPort()
  if (port === null)
    return null
  if (process.env.MESH_TCP_LISTEN === '0')
    return null
  if (hub)
    return hub
  hub = await startTcpMeshHub({ host: meshTcpHost(), port })
  console.info(`[mesh] TCP hub listening on ${hub.host}:${hub.port}`)
  return hub
}

/** Connect (and bind) a workspace peer if MESH_TCP_PORT is set. Idempotent. */
export async function ensureWorkspaceMeshPeer(workspaceId: string): Promise<void> {
  const port = meshTcpPort()
  if (port === null)
    return

  const existing = connecting.get(workspaceId)
  if (existing) {
    await existing
    return
  }

  const run = (async () => {
    await ensureMeshTcpHub()
    const host = meshTcpHost()
    // Prefix from env (default nuxt); workspace id keeps multi-vault peers unique on one hub.
    const peerId = `${process.env.MESH_PEER_ID?.trim() || 'nuxt'}:${workspaceId}`
    const transport = await connectTcpMeshPeer({ host, port, peerId })
    bindWorkspaceMeshTransport(workspaceId, transport)
    console.info(`[mesh] peer ${peerId} bound to workspace ${workspaceId}`)
  })()

  connecting.set(workspaceId, run)
  try {
    await run
  }
  catch (error) {
    connecting.delete(workspaceId)
    throw error
  }
}

export async function shutdownMeshPeers(): Promise<void> {
  if (hub) {
    await hub.close()
    hub = null
  }
  connecting.clear()
}
