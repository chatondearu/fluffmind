import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DaemonHttpError, DaemonMeshTransport, putDaemonVault } from './daemon.ts'
import type { MeshFileUpdate } from './types.ts'

interface Recorded { method?: string, url?: string, auth?: string, body: unknown }

describe('DaemonMeshTransport (stub daemon)', () => {
  let server: Server
  let url: string
  let requests: Recorded[]
  let streams: ServerResponse[]
  let replies: Map<string, { status: number, body: unknown }>
  let eventConnections: number

  beforeEach(async () => {
    requests = []
    streams = []
    replies = new Map()
    eventConnections = 0
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/v1/events') {
        eventConnections++
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(': keep-alive\n\n')
        streams.push(res)
        return
      }
      let raw = ''
      req.on('data', chunk => (raw += chunk))
      req.on('end', () => {
        requests.push({
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          body: raw ? JSON.parse(raw) : undefined,
        })
        const reply = replies.get(`${req.method} ${req.url}`) ?? { status: 200, body: { ok: true, changed: true } }
        res.writeHead(reply.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(reply.body))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    for (const stream of streams)
      stream.destroy()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })

  function nextUpdate(transport: DaemonMeshTransport, count = 1): Promise<MeshFileUpdate[]> {
    const got: MeshFileUpdate[] = []
    return new Promise((resolve) => {
      transport.onUpdate((update) => {
        got.push(update)
        if (got.length === count)
          resolve(got)
      })
    })
  }

  function emit(event: object): void {
    for (const stream of streams)
      stream.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  it('publish POSTs the change with the bearer token and without content', async () => {
    const transport = new DaemonMeshTransport({ url, token: 's3cret', vault: 'ws-1' })

    await transport.publish({
      path: 'writers/user/alice/a.md',
      content: 'ignored',
      mtimeMs: 1,
      writer: 'user:alice',
    })
    await transport.publish({ path: 'notes/a.md', content: '', mtimeMs: 2, writer: 'user:alice', published: true, deleted: true })

    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/v1/mesh/changed',
        auth: 'Bearer s3cret',
        body: { vault: 'ws-1', path: 'writers/user/alice/a.md', writer: 'user:alice', published: false, deleted: false },
      },
      {
        method: 'POST',
        url: '/v1/mesh/changed',
        auth: 'Bearer s3cret',
        body: { vault: 'ws-1', path: 'notes/a.md', writer: 'user:alice', published: true, deleted: true },
      },
    ])
  })

  it('maps daemon errors to DaemonHttpError and rejects after close', async () => {
    replies.set('POST /v1/mesh/changed', { status: 404, body: { error: 'unknown vault' } })
    const transport = new DaemonMeshTransport({ url, vault: 'nope' })

    await expect(transport.publish({ path: 'a.md', content: '', mtimeMs: 1, writer: 'user:a' }))
      .rejects.toMatchObject({ name: 'DaemonHttpError', status: 404, message: 'unknown vault' })
    expect(requests[0]?.auth).toBeUndefined()

    await transport.close()
    await expect(transport.publish({ path: 'a.md', content: '', mtimeMs: 1 })).rejects.toThrow(/closed/)
  })

  it('shares one SSE connection and filters events per vault', async () => {
    const a = new DaemonMeshTransport({ url, vault: 'ws-a' })
    const b = new DaemonMeshTransport({ url, vault: 'ws-b' })
    const forA = nextUpdate(a, 2)
    const forB = nextUpdate(b)

    await new Promise(resolve => setTimeout(resolve, 100))
    emit({ vault: 'ws-b', path: 'notes/b.md', mtimeMs: 5, deleted: false, persisted: true })
    emit({ vault: 'ws-a', path: 'writers/device/d/a.md', mtimeMs: 6, deleted: false, persisted: true })
    emit({ vault: 'ws-a', path: 'notes/gone.md', mtimeMs: 7, deleted: true, persisted: true })

    expect(eventConnections).toBe(1)
    expect(await forB).toEqual([{ path: 'notes/b.md', content: '', mtimeMs: 5, peerId: 'daemon:ws-b', deleted: false, persisted: true }])
    expect((await forA).map(u => [u.path, u.deleted, u.persisted])).toEqual([
      ['writers/device/d/a.md', false, true],
      ['notes/gone.md', true, true],
    ])

    await a.close()
    await b.close()
  })

  it('reconnects after the stream drops', async () => {
    const transport = new DaemonMeshTransport({ url, vault: 'ws-1', reconnectMs: 10 })
    const got = nextUpdate(transport)
    await new Promise(resolve => setTimeout(resolve, 100))

    streams.shift()?.destroy()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(eventConnections).toBe(2)
    emit({ vault: 'ws-1', path: 'notes/x.md', mtimeMs: 9, deleted: false, persisted: true })

    expect((await got)[0]?.path).toBe('notes/x.md')
    await transport.close()
  })

  it('pushes vault config with PUT /v1/vaults/:id', async () => {
    replies.set('PUT /v1/vaults/ws-1', { status: 200, body: { id: 'ws-1', syncMode: 'mesh-live', attached: true, meshVault: 'abc' } })
    const config = { syncMode: 'mesh-live' as const, contentRoots: ['notes'], path: '/data/ws-1' }

    const state = await putDaemonVault({ url, token: 't' }, 'ws-1', config)

    expect(state).toMatchObject({ id: 'ws-1', attached: true })
    expect(requests).toEqual([{ method: 'PUT', url: '/v1/vaults/ws-1', auth: 'Bearer t', body: config }])

    replies.set('PUT /v1/vaults/ws-1', { status: 400, body: { error: 'bad path' } })
    const failure = await putDaemonVault({ url }, 'ws-1', config).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DaemonHttpError)
    expect(failure).toMatchObject({ status: 400, message: 'bad path' })
  })
})
