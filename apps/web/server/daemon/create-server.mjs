/**
 * Localhost HTTP facade for portable mesh-live writes (ADR-016).
 * Thin slice: health + PUT note — no Git. Optional MESH_TCP_* publish after write.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import {
  InvalidNoteIdError,
  InvalidWriterIdentityError,
  WriterPrefixViolationError,
  noteIdForMeshWriter,
  parseWriterIdentity,
  resolveNoteFilePath,
  writeNoteLocal,
} from './write-local.mjs'
import { meshTcpEnv, publishNoteOverTcpMesh } from './mesh-publish.mjs'

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim())
    return {}
  return JSON.parse(raw)
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function mapWriteError(error) {
  if (
    error instanceof InvalidWriterIdentityError
    || error instanceof WriterPrefixViolationError
    || error instanceof InvalidNoteIdError
  ) {
    return { status: 400, message: error.message }
  }
  if (error instanceof SyntaxError) {
    return { status: 400, message: 'Invalid JSON body' }
  }
  return { status: 500, message: error?.message || 'Internal error' }
}

/**
 * @param {{ vaultPath: string, defaultWriter: string, host?: string, port?: number }} opts
 */
export function createDaemonServer(opts) {
  const vaultPath = opts.vaultPath
  const defaultWriter = opts.defaultWriter || 'device:solo'
  const host = opts.host || '127.0.0.1'
  const port = opts.port ?? 8787

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`)

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          vaultPath,
          defaultWriter,
          syncMode: 'mesh-live',
        })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/v1/notes') {
        const body = await readJsonBody(req)
        const id = body.id
        if (typeof id !== 'string' || !id.trim()) {
          sendJson(res, 400, { error: 'Body must include string "id"' })
          return
        }
        if (typeof body.content !== 'string') {
          sendJson(res, 400, { error: 'Body must include string "content"' })
          return
        }
        const writer = typeof body.writer === 'string' && body.writer.trim()
          ? body.writer.trim()
          : defaultWriter

        const result = await writeNoteLocal({
          vaultPath,
          id,
          content: body.content,
          writer,
        })

        const mesh = meshTcpEnv()
        if (mesh) {
          try {
            await publishNoteOverTcpMesh({
              ...mesh,
              path: result.id.endsWith('.md') ? result.id : `${result.id}.md`,
              content: body.content,
            })
          }
          catch (error) {
            console.error('[daemon] mesh publish failed:', error)
          }
        }

        sendJson(res, result.created ? 201 : 200, result)
        return
      }

      if (req.method === 'GET' && url.pathname === '/v1/notes') {
        const idParam = url.searchParams.get('id')
        if (!idParam?.trim()) {
          sendJson(res, 400, { error: 'Query "id" is required' })
          return
        }
        const writerRaw = url.searchParams.get('writer')?.trim() || defaultWriter
        const writer = parseWriterIdentity(writerRaw)
        const noteId = noteIdForMeshWriter(idParam, writer)
        const filePath = resolveNoteFilePath(vaultPath, noteId)
        try {
          const content = await readFile(filePath, 'utf-8')
          sendJson(res, 200, { id: noteId, content, path: filePath })
        }
        catch (error) {
          if (error?.code === 'ENOENT') {
            sendJson(res, 404, { error: 'Note not found', id: noteId })
            return
          }
          throw error
        }
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    }
    catch (error) {
      const mapped = mapWriteError(error)
      sendJson(res, mapped.status, { error: mapped.message })
    }
  })

  return {
    server,
    host,
    port,
    listen() {
      return new Promise((resolveListen, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          resolveListen({ host, port, url: `http://${host}:${port}` })
        })
      })
    },
    close() {
      return new Promise((resolveClose, reject) => {
        server.close(err => (err ? reject(err) : resolveClose()))
      })
    },
  }
}
