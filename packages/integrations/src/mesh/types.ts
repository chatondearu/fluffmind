/**
 * Thin mesh sync contract for live vault file replication (ADR-016).
 * Concrete transports (iroh, etc.) plug in behind this; spike uses in-memory.
 */

/** Whole-file update — first PRD granularity (LWW is applied by the peer, not the wire). */
export interface MeshFileUpdate {
  path: string
  content: string
  /** Milliseconds since epoch; higher wins for last-writer-wins per path. */
  mtimeMs: number
  /** Origin peer id (for debugging / ignore-echo). */
  peerId: string
}

export type MeshFileUpdateHandler = (update: MeshFileUpdate) => void

/**
 * Peer-facing mesh transport: publish local file changes and observe remote ones.
 * Connection / discovery is transport-specific (see InMemoryMeshHub for the stub).
 */
export interface MeshSyncTransport {
  readonly peerId: string
  publish: (update: Omit<MeshFileUpdate, 'peerId'>) => Promise<void>
  /** Subscribe to remote updates (does not echo local publishes). Returns unsubscribe. */
  onUpdate: (handler: MeshFileUpdateHandler) => () => void
  close: () => Promise<void>
}
