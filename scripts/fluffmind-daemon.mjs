#!/usr/bin/env node
/**
 * Portable Fluffmind daemon (PLAN-042 T7 / ADR-016).
 * Localhost HTTP peer that writes mesh-live notes under writers/<kind>/<id>/ — no Git.
 *
 * Usage:
 *   node scripts/fluffmind-daemon.mjs --vault /path/to/vault [--port 8787] [--writer device:solo]
 *   node scripts/fluffmind-daemon.mjs --self-check
 *   node scripts/fluffmind-daemon.mjs --help
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDaemonServer } from '../apps/web/server/daemon/create-server.mjs'
import { writeNoteLocal } from '../apps/web/server/daemon/write-local.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function printHelp() {
  console.log(`fluffmind-daemon — portable mesh-live write facade (no Git)

Usage:
  node scripts/fluffmind-daemon.mjs --vault <dir> [options]
  node scripts/fluffmind-daemon.mjs --self-check
  node scripts/fluffmind-daemon.mjs --help

Options:
  --vault <dir>     Vault folder root (required unless --self-check)
  --port <n>        Listen port (default 8787)
  --host <addr>     Bind address (default 127.0.0.1)
  --writer <id>     Default writer identity (default device:solo)
  --self-check      Write + HTTP round-trip in a temp vault, then exit
  --help, -h        Show this help

HTTP:
  GET  /health
  PUT  /v1/notes   JSON { "id", "content", "writer"? }
  GET  /v1/notes?id=<note>&writer=<optional>
`)
}

function parseArgs(argv) {
  const opts = {
    vault: null,
    port: 8787,
    host: '127.0.0.1',
    writer: process.env.SYNC_WRITER_DEVICE?.trim()
      ? `device:${process.env.SYNC_WRITER_DEVICE.trim()}`
      : 'device:solo',
    selfCheck: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h')
      opts.help = true
    else if (a === '--self-check')
      opts.selfCheck = true
    else if (a === '--vault')
      opts.vault = resolve(argv[++i] || '')
    else if (a === '--port')
      opts.port = Number(argv[++i])
    else if (a === '--host')
      opts.host = argv[++i]
    else if (a === '--writer')
      opts.writer = argv[++i]
    else
      throw new Error(`Unknown argument: ${a}`)
  }
  if (Number.isNaN(opts.port) || opts.port < 1 || opts.port > 65535) {
    throw new Error('--port must be a valid TCP port')
  }
  return opts
}

function assert(cond, message) {
  if (!cond)
    throw new Error(`self-check failed: ${message}`)
}

async function runSelfCheck() {
  const root = await mkdtemp(join(tmpdir(), 'fluffmind-daemon-'))
  const daemon = createDaemonServer({
    vaultPath: root,
    defaultWriter: 'device:solo',
    host: '127.0.0.1',
    port: 0,
  })

  try {
    const direct = await writeNoteLocal({
      vaultPath: root,
      id: 'smoke-direct',
      content: 'direct-ok\n',
      writer: 'device:solo',
    })
    assert(direct.id === 'writers/device/solo/smoke-direct', `unexpected id ${direct.id}`)
    assert(direct.committed === false && direct.pushed === false, 'must skip Git')
    const onDisk = await readFile(direct.path, 'utf-8')
    assert(onDisk === 'direct-ok\n', 'direct write content mismatch')

    const { port } = await new Promise((resolveListen, reject) => {
      daemon.server.once('error', reject)
      daemon.server.listen(0, '127.0.0.1', () => {
        const addr = daemon.server.address()
        resolveListen({ port: addr.port })
      })
    })

    const base = `http://127.0.0.1:${port}`
    const health = await fetch(`${base}/health`)
    assert(health.ok, `health HTTP ${health.status}`)
    const healthBody = await health.json()
    assert(healthBody.syncMode === 'mesh-live', 'health syncMode')

    const put = await fetch(`${base}/v1/notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'smoke-http', content: 'http-ok\n' }),
    })
    assert(put.status === 201, `PUT status ${put.status}`)
    const putBody = await put.json()
    assert(putBody.id === 'writers/device/solo/smoke-http', `PUT id ${putBody.id}`)
    assert(putBody.committed === false, 'PUT must not commit')

    const get = await fetch(`${base}/v1/notes?id=smoke-http`)
    assert(get.ok, `GET HTTP ${get.status}`)
    const getBody = await get.json()
    assert(getBody.content === 'http-ok\n', 'GET content mismatch')

    const forbidden = await fetch(`${base}/v1/notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'writers/user/alice/stolen',
        content: 'nope',
        writer: 'device:solo',
      }),
    })
    assert(forbidden.status === 400, `prefix reject status ${forbidden.status}`)

    console.log('self-check: ok')
  }
  finally {
    await daemon.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }
  if (opts.selfCheck) {
    await runSelfCheck()
    return
  }
  if (!opts.vault) {
    console.error('Missing --vault <dir> (or pass --self-check / --help)')
    process.exit(1)
  }

  const daemon = createDaemonServer({
    vaultPath: opts.vault,
    defaultWriter: opts.writer,
    host: opts.host,
    port: opts.port,
  })
  const { url } = await daemon.listen()
  console.log(`fluffmind-daemon listening on ${url}`)
  console.log(`vault=${opts.vault} writer=${opts.writer} syncMode=mesh-live`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
