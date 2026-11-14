export interface VaultInvalidateClientEvent {
  type: 'vault-invalidate'
  workspaceId: string
  reason: string
  noteId?: string
  at: string
}

/**
 * Subscribe to vault invalidate events over `/ws/vault` (client-only).
 * Call refresh from the caller when an event arrives for the active workspace.
 */
export function useVaultInvalidate(
  workspaceId: MaybeRefOrGetter<string>,
  onInvalidate: (event: VaultInvalidateClientEvent) => void,
) {
  let socket: WebSocket | undefined

  function connect() {
    if (!import.meta.client)
      return
    const id = toValue(workspaceId)
    if (!id)
      return

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${scheme}://${location.host}/ws/vault`)
    socket.addEventListener('open', () => {
      socket?.send(JSON.stringify({ type: 'subscribe', workspaceId: id }))
    })
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data)) as VaultInvalidateClientEvent
        if (data.type === 'vault-invalidate' && data.workspaceId === toValue(workspaceId))
          onInvalidate(data)
      }
      catch {
        // ignore non-JSON
      }
    })
  }

  function disconnect() {
    socket?.close()
    socket = undefined
  }

  if (import.meta.client) {
    onMounted(() => connect())
    onBeforeUnmount(() => disconnect())
    watch(() => toValue(workspaceId), () => {
      disconnect()
      connect()
    })
  }

  return { reconnect: connect, disconnect }
}
