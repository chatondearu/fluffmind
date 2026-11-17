/**
 * Thin mesh sync contract for live vault file replication (ADR-016).
 * Concrete transports (iroh, etc.) plug in behind this; spike uses in-memory.
 */

/** Whole-file update — first PRD granularity (LWW is applied by the peer, not the wire). */
export interface MeshFileUpdate {
  path: string
  /** File body. Empty (ignored) when `deleted` or `persisted`: the file is already on disk / gone. */
  content: string
  /** Milliseconds since epoch; higher wins for last-writer-wins per path. */
  mtimeMs: number
  /** Origin peer id (for debugging / ignore-echo). */
  peerId: string
  /** `kind:id` of the writer that produced the change (outbound to the daemon). */
  writer?: string
  /** Canonical (non-`writers/`) path change from the explicit publish action (ADR-017). */
  published?: boolean
  /** Tombstone: the file was removed. */
  deleted?: boolean
  /** Inbound: the daemon already wrote/removed the file; consumers must not rewrite it. */
  persisted?: boolean
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
