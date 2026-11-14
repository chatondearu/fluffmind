/**
 * Localhost TCP mesh hub — real sockets (not an in-process Map).
 * Line-delimited JSON; Alpine-friendly; zero native deps (iroh still deferred).
 */
import { createServer, connect, type Server, type Socket } from 'node:net'
import type { MeshFileUpdate, MeshFileUpdateHandler, MeshSyncTransport } from './types.ts'

type HelloMsg = { type: 'hello', peerId: string }
type WelcomeMsg = { type: 'welcome', peerId: string }
type UpdateMsg = { type: 'update', update: MeshFileUpdate }
type WireMsg = HelloMsg | WelcomeMsg | UpdateMsg

export interface TcpMeshHubHandle {
  readonly host: string
  readonly port: number
  close: () => Promise<void>
}

type HubPeer = {
  peerId: string
  socket: Socket
}

function writeMsg(socket: Socket, msg: WireMsg): void {
  socket.write(`${JSON.stringify(msg)}\n`)
}

function attachLineReader(socket: Socket, onLine: (line: string) => void): void {
  let buf = ''
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    let nl = buf.indexOf('\n')
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line)
        onLine(line)
      nl = buf.indexOf('\n')
    }
  })
}

/**
 * Bind a TCP hub on localhost (port 0 = ephemeral). Peers connect via connectTcpMeshPeer.
 */
export function startTcpMeshHub(opts?: {
  host?: string
  port?: number
}): Promise<TcpMeshHubHandle> {
  const host = opts?.host ?? '127.0.0.1'
  const port = opts?.port ?? 0
  const peers = new Map<string, HubPeer>()

  return new Promise((resolve, reject) => {
    const server: Server = createServer((socket) => {
      let peerId: string | undefined

      attachLineReader(socket, (line) => {
        let msg: WireMsg
        try {
          msg = JSON.parse(line) as WireMsg
        }
        catch {
          return
        }

        if (msg.type === 'hello') {
          if (peers.has(msg.peerId)) {
            socket.destroy()
            return
          }
          peerId = msg.peerId
          peers.set(peerId, { peerId, socket })
          writeMsg(socket, { type: 'welcome', peerId })
          return
        }

        if (msg.type === 'update' && peerId) {
          const update = msg.update
          for (const [id, remote] of peers) {
            if (id === peerId)
              continue
            writeMsg(remote.socket, { type: 'update', update })
          }
        }
      })

      socket.on('close', () => {
        if (peerId)
          peers.delete(peerId)
      })
      socket.on('error', () => {
        /* closed peers are cleaned on 'close' */
      })
    })

    server.once('error', reject)
    server.listen(port, host, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('tcp mesh hub: unexpected address'))
        return
      }
      resolve({
        host,
        port: addr.port,
        close: () => new Promise((res, rej) => {
          for (const p of peers.values())
            p.socket.destroy()
          peers.clear()
          server.close(err => err ? rej(err) : res())
        }),
      })
    })
  })
}

/**
 * Connect a MeshSyncTransport peer to a running TCP hub over a real socket.
 */
export function connectTcpMeshPeer(opts: {
  host: string
  port: number
  peerId: string
}): Promise<MeshSyncTransport> {
  const { host, port, peerId } = opts
  const handlers = new Set<MeshFileUpdateHandler>()

  return new Promise((resolve, reject) => {
    let settled = false
    const socket = connect({ host, port }, () => {
      writeMsg(socket, { type: 'hello', peerId })
    })

    attachLineReader(socket, (line) => {
      let msg: WireMsg
      try {
        msg = JSON.parse(line) as WireMsg
      }
      catch {
        return
      }

      if (msg.type === 'welcome' && msg.peerId === peerId && !settled) {
        settled = true
        const transport: MeshSyncTransport = {
          peerId,
          publish: async (partial) => {
            if (socket.destroyed)
              throw new Error(`mesh peer closed: ${peerId}`)
            const update: MeshFileUpdate = { ...partial, peerId }
            writeMsg(socket, { type: 'update', update })
          },
          onUpdate: (handler) => {
            handlers.add(handler)
            return () => {
              handlers.delete(handler)
            }
          },
          close: async () => {
            handlers.clear()
            if (socket.destroyed)
              return
            await new Promise<void>((res) => {
              socket.once('close', () => res())
              socket.destroy()
            })
          },
        }
        resolve(transport)
        return
      }

      if (msg.type !== 'update')
        return
      if (msg.update.peerId === peerId)
        return
      for (const handler of handlers)
        handler(msg.update)
    })

    socket.once('error', (err) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    })
  })
}
