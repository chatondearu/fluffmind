/**
 * Fire-and-forget TCP mesh publish for the portable daemon (same wire as tcp-hub.ts).
 * shortcut: one-shot connect per write; upgrade to a long-lived peer when daemon stays up.
 */
import { connect } from 'node:net'

function writeMsg(socket, msg) {
  socket.write(`${JSON.stringify(msg)}\n`)
}

function attachLineReader(socket, onLine) {
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
 * @param {{ host: string, port: number, peerId: string, path: string, content: string, mtimeMs?: number }} opts
 */
export function publishNoteOverTcpMesh(opts) {
  const { host, port, peerId, path, content } = opts
  const mtimeMs = opts.mtimeMs ?? Date.now()

  return new Promise((resolve, reject) => {
    let settled = false
    const socket = connect({ host, port }, () => {
      writeMsg(socket, { type: 'hello', peerId })
    })

    attachLineReader(socket, (line) => {
      let msg
      try {
        msg = JSON.parse(line)
      }
      catch {
        return
      }
      if (msg.type === 'welcome' && msg.peerId === peerId && !settled) {
        settled = true
        writeMsg(socket, {
          type: 'update',
          update: { path, content, mtimeMs, peerId },
        })
        socket.end(() => resolve())
      }
    })

    socket.once('error', (err) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    setTimeout(() => {
      if (!settled) {
        settled = true
        socket.destroy()
        reject(new Error('mesh publish timeout'))
      }
    }, 3000)
  })
}

export function meshTcpEnv() {
  const host = process.env.MESH_TCP_HOST?.trim() || '127.0.0.1'
  const raw = process.env.MESH_TCP_PORT?.trim()
  if (!raw)
    return null
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port >= 65536)
    return null
  // Unique peer id per publish — one-shot sockets; hub rejects duplicate live peerIds.
  const base = process.env.MESH_PEER_ID?.trim() || 'daemon:solo'
  const peerId = `${base}:${Date.now().toString(36)}`
  return { host, port, peerId }
}
