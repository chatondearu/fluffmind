/**
 * Bridge between vault-invalidate hub and Nitro WebSocket peers.
 * Kept separate so unit tests do not need a live WS upgrade.
 */

type SendablePeer = {
  id: string
  send: (data: string) => void
}

const peersByWorkspace = new Map<string, Map<string, SendablePeer>>()
const workspaceByPeerId = new Map<string, string>()

export function registerVaultWsPeer(workspaceId: string, peer: SendablePeer): void {
  unregisterVaultWsPeer(peer.id)
  let map = peersByWorkspace.get(workspaceId)
  if (!map) {
    map = new Map()
    peersByWorkspace.set(workspaceId, map)
  }
  map.set(peer.id, peer)
  workspaceByPeerId.set(peer.id, workspaceId)
}

export function unregisterVaultWsPeer(peerId: string): void {
  const workspaceId = workspaceByPeerId.get(peerId)
  if (!workspaceId)
    return
  workspaceByPeerId.delete(peerId)
  const map = peersByWorkspace.get(workspaceId)
  if (!map)
    return
  map.delete(peerId)
  if (map.size === 0)
    peersByWorkspace.delete(workspaceId)
}

export function broadcastVaultWs(workspaceId: string, payload: string): void {
  const map = peersByWorkspace.get(workspaceId)
  if (!map)
    return
  for (const peer of map.values()) {
    try {
      peer.send(payload)
    }
    catch {
      // drop broken peer on next close
    }
  }
}

export function clearVaultWsPeers(): void {
  peersByWorkspace.clear()
  workspaceByPeerId.clear()
}
