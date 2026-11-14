import {
  registerVaultWsPeer,
  unregisterVaultWsPeer,
} from '../../vault/vault-ws-peers'

/**
 * WebSocket: clients send `{ "type": "subscribe", "workspaceId": "…" }` then
 * receive `vault-invalidate` JSON events (ADR-019 / PRD-042 T5).
 *
 * Path: `/ws/vault` (requires `nitro.experimental.websocket`).
 */
export default defineWebSocketHandler({
  open(peer) {
    peer.send(JSON.stringify({ type: 'hello', channel: 'vault' }))
  },
  message(peer, message) {
    let data: { type?: string, workspaceId?: string }
    try {
      data = JSON.parse(message.text()) as { type?: string, workspaceId?: string }
    }
    catch {
      peer.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      return
    }

    if (data.type !== 'subscribe' || typeof data.workspaceId !== 'string' || !data.workspaceId.trim()) {
      peer.send(JSON.stringify({
        type: 'error',
        message: 'Expected { "type": "subscribe", "workspaceId": "…" }',
      }))
      return
    }

    const workspaceId = data.workspaceId.trim()
    registerVaultWsPeer(workspaceId, peer)
    peer.send(JSON.stringify({ type: 'subscribed', workspaceId }))
  },
  close(peer) {
    unregisterVaultWsPeer(peer.id)
  },
})
