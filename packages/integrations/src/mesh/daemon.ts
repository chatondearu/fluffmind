/**
 * MeshSyncTransport backed by the Rust daemon over HTTP only (ADR-020): Nuxt never
 * links iroh. Local changes are reported with `POST /v1/mesh/changed`; remote changes
 * arrive on the daemon's `GET /v1/events` SSE stream (the daemon has already written
 * the file, so events carry `persisted: true`).
 */
import type { MeshFileUpdate, MeshFileUpdateHandler, MeshSyncTransport } from './types.ts'

export interface DaemonClientOptions {
  /** Daemon base URL, e.g. `http://127.0.0.1:8787`. */
  url: string
  /** `FLUFFMIND_DAEMON_TOKEN` — sent as a bearer token when set. */
  token?: string
  /** Initial SSE reconnect delay (doubles up to 10s). Default 500ms. */
  reconnectMs?: number
}

export interface DaemonVaultConfig {
  syncMode: 'mesh-live' | 'git-live'
  contentRoots: string[]
  /** Absolute vault directory on the daemon's filesystem. */
  path: string
}

export interface DaemonVaultState {
  id: string
  syncMode: string
  attached: boolean
  meshVault: string | null
}

/** Non-2xx daemon answer; `message` is the daemon's `{ error }` when present. */
export class DaemonHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DaemonHttpError'
    this.status = status
  }
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function requestJson<T>(
  options: DaemonClientOptions,
  method: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${baseUrl(options.url)}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders(options.token) },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  }
  catch {
    parsed = undefined
  }
  if (!response.ok) {
    const message = (parsed as { error?: unknown } | undefined)?.error
    throw new DaemonHttpError(
      response.status,
      typeof message === 'string' ? message : `daemon ${method} ${path} failed (${response.status})`,
    )
  }
  return parsed as T
}

/** `PUT /v1/vaults/:id` — replace the daemon's view of a vault (non-mesh-live detaches it). */
export function putDaemonVault(
  options: DaemonClientOptions,
  vaultId: string,
  config: DaemonVaultConfig,
): Promise<DaemonVaultState> {
  return requestJson<DaemonVaultState>(options, 'PUT', `/v1/vaults/${encodeURIComponent(vaultId)}`, config)
}

type SseEvent = { vault: string, path: string, mtimeMs: number, deleted?: boolean }
type SseListener = (event: SseEvent) => void

/** One streaming reader per daemon (url + token), fanned out to per-vault listeners. */
class SharedEventReader {
  private readonly listeners = new Set<SseListener>()
  private abort: AbortController | null = null

  constructor(
    private readonly options: DaemonClientOptions,
    private readonly onEmpty: () => void,
  ) {}

  subscribe(listener: SseListener): () => void {
    this.listeners.add(listener)
    if (!this.abort)
      void this.run(this.abort = new AbortController())
    return () => {
      if (!this.listeners.delete(listener))
        return
      if (this.listeners.size === 0) {
        this.abort?.abort()
        this.abort = null
        this.onEmpty()
      }
    }
  }

  private async run(controller: AbortController): Promise<void> {
    let delay = this.options.reconnectMs ?? 500
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${baseUrl(this.options.url)}/v1/events`, {
          headers: { accept: 'text/event-stream', ...authHeaders(this.options.token) },
          signal: controller.signal,
        })
        if (!response.ok || !response.body)
          throw new DaemonHttpError(response.status, `daemon GET /v1/events failed (${response.status})`)
        delay = this.options.reconnectMs ?? 500
        await this.consume(response.body, controller.signal)
      }
      catch {
        // Dropped or refused: fall through to the backoff below.
      }
      if (controller.signal.aborted)
        return
      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, 10_000)
    }
  }

  private async consume(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done)
        return
      buffer += decoder.decode(value, { stream: true })
      let end = buffer.search(/\r?\n\r?\n/)
      while (end !== -1) {
        this.dispatch(buffer.slice(0, end))
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
        end = buffer.search(/\r?\n\r?\n/)
      }
    }
  }

  private dispatch(block: string): void {
    // Comment lines (": keep-alive") start with ":" and are skipped.
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data)
      return
    let event: SseEvent
    try {
      event = JSON.parse(data) as SseEvent
    }
    catch {
      return
    }
    if (typeof event.vault !== 'string' || typeof event.path !== 'string')
      return
    for (const listener of this.listeners)
      listener(event)
  }
}

const readers = new Map<string, SharedEventReader>()

function sharedReader(options: DaemonClientOptions): SharedEventReader {
  const key = `${baseUrl(options.url)}\n${options.token ?? ''}`
  let reader = readers.get(key)
  if (!reader) {
    const created: SharedEventReader = reader = new SharedEventReader(options, () => {
      if (readers.get(key) === created)
        readers.delete(key)
    })
    readers.set(key, reader)
  }
  return reader
}

export interface DaemonMeshTransportOptions extends DaemonClientOptions {
  /** Workspace id the daemon knows this vault by (`PUT /v1/vaults/:id`). */
  vault: string
}

export class DaemonMeshTransport implements MeshSyncTransport {
  readonly peerId: string
  private readonly unsubs = new Set<() => void>()
  private closed = false

  constructor(private readonly options: DaemonMeshTransportOptions) {
    this.peerId = `daemon:${options.vault}`
  }

  async publish(update: Omit<MeshFileUpdate, 'peerId'>): Promise<void> {
    if (this.closed)
      throw new Error(`mesh transport closed: ${this.peerId}`)
    // `content` is deliberately not sent: the file is already on disk and the daemon re-hashes it.
    await requestJson(this.options, 'POST', '/v1/mesh/changed', {
      vault: this.options.vault,
      path: update.path,
      writer: update.writer,
      published: update.published ?? false,
      deleted: update.deleted ?? false,
    })
  }

  onUpdate(handler: MeshFileUpdateHandler): () => void {
    const unsub = sharedReader(this.options).subscribe((event) => {
      if (event.vault !== this.options.vault)
        return
      handler({
        path: event.path,
        content: '',
        mtimeMs: event.mtimeMs,
        peerId: this.peerId,
        deleted: event.deleted === true,
        persisted: true,
      })
    })
    const release = () => {
      this.unsubs.delete(release)
      unsub()
    }
    this.unsubs.add(release)
    return release
  }

  async close(): Promise<void> {
    this.closed = true
    for (const release of [...this.unsubs])
      release()
  }
}
