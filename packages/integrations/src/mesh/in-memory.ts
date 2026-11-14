import type { MeshFileUpdate, MeshFileUpdateHandler, MeshSyncTransport } from './types.ts'

type PeerSlot = {
  peerId: string
  handlers: Set<MeshFileUpdateHandler>
}

/**
 * Shared in-process hub that wires stub peers together (no network / iroh).
 * Useful for unit tests and local spikes until a real transport lands.
 */
export class InMemoryMeshHub {
  private readonly peers = new Map<string, PeerSlot>()

  join(peerId: string): MeshSyncTransport {
    if (this.peers.has(peerId))
      throw new Error(`mesh peer already joined: ${peerId}`)

    const slot: PeerSlot = { peerId, handlers: new Set() }
    this.peers.set(peerId, slot)

    const transport: MeshSyncTransport = {
      peerId,
      publish: async (partial) => {
        if (!this.peers.has(peerId))
          throw new Error(`mesh peer closed: ${peerId}`)

        const update: MeshFileUpdate = { ...partial, peerId }
        for (const [id, remote] of this.peers) {
          if (id === peerId)
            continue
          for (const handler of remote.handlers)
            handler(update)
        }
      },
      onUpdate: (handler) => {
        slot.handlers.add(handler)
        return () => {
          slot.handlers.delete(handler)
        }
      },
      close: async () => {
        this.peers.delete(peerId)
        slot.handlers.clear()
      },
    }

    return transport
  }
}

/** Factory helper matching the spike naming in PLAN-042 T8. */
export function createInMemoryMeshHub(): InMemoryMeshHub {
  return new InMemoryMeshHub()
}
