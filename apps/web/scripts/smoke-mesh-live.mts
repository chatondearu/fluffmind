#!/usr/bin/env node
/**
 * Operator smoke for PRD-042 mesh-live (no DATABASE_URL, no network beyond 127.0.0.1).
 *
 * 1. Two peers over MESH_TCP_PORT: portable daemon (vault A) writes a draft →
 *    TCP hub → Nuxt-side peer (vault B) applies it + WS invalidate → explicit
 *    publish to canonical on B. A rogue canonical update must not clobber root.
 * 2. Dual-mode flip on a throwaway Git vault: git-live commits, mesh-live skips Git,
 *    flipping back to git-live commits again (rollback).
 *
 * Usage:
 *   pnpm --filter @fluffmind/web run test:mesh-smoke
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`smoke failed: ${message}`)
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitFor<T>(label: string, probe: () => T | undefined | Promise<T | undefined>): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const value = await probe()
    if (value !== undefined) return value
    await delay(50)
  }
  throw new Error(`smoke failed: timed out waiting for ${label}`)
}

const root = await mkdtemp(join(tmpdir(), 'fluffmind-mesh-smoke-'))
const vaultA = join(root, 'vault-a')
const vaultB = join(root, 'vault-b')
const vaultFlip = join(root, 'vault-flip')

delete process.env.DATABASE_URL
Object.assign(process.env, {
  AUTH_DISABLED: 'true',
  WORKSPACES_ROOT: root,
  VAULT_PATH: vaultB,
  SYNC_MODE: 'mesh-live',
  MESH_TCP_PORT: String(await freePort()),
  MESH_PEER_ID: 'smoke',
})

const { ensureWorkspaceMeshPeer, shutdownMeshPeers } = await import('../server/vault/mesh-peer-bootstrap.ts')
const { unbindWorkspaceMeshTransport } = await import('../server/vault/mesh-apply.ts')
const { registerVaultWsPeer } = await import('../server/vault/vault-ws-peers.ts')
const { publishNoteToCanonical } = await import('../server/vault/publish.ts')
const { writeToWorkspace } = await import('../server/vault/write.ts')
const { createDaemonServer } = await import('../server/daemon/create-server.mjs')
const { connectTcpMeshPeer } = await import('@fluffmind/integrations')

const wsEvents: Array<{ reason: string, noteId?: string }> = []
let daemon: ReturnType<typeof createDaemonServer> | undefined

try {
  // --- 1. Two peers over MESH_TCP_PORT -------------------------------------------
  await ensureWorkspaceMeshPeer('default')
  registerVaultWsPeer('default', { id: 'smoke-browser', send: data => wsEvents.push(JSON.parse(data)) })

  daemon = createDaemonServer({ vaultPath: vaultA, defaultWriter: 'device:laptop', port: 0 })
  await daemon.listen()
  const { port: daemonPort } = daemon.server.address() as { port: number }

  const put = await fetch(`http://127.0.0.1:${daemonPort}/v1/notes`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'ideas', content: '# Ideas from laptop\n' }),
  })
  assert(put.status === 201, `daemon PUT returned ${put.status}`)
  const draftId = 'writers/device/laptop/ideas'

  await waitFor('WS invalidate after apply', () =>
    wsEvents.find(e => e.reason === 'note-write' && e.noteId === draftId))
  const applied = await readFile(join(vaultB, `${draftId}.md`), 'utf-8')
  assert(applied.includes('Ideas from laptop'), 'draft applied on peer B')
  console.log('✓ daemon write → TCP mesh → apply on peer B → WS invalidate')

  await publishNoteToCanonical('default', { sourceId: draftId, writer: 'device:laptop' })
  assert((await readFile(join(vaultB, 'ideas.md'), 'utf-8')).includes('Ideas from laptop'), 'canonical published')
  assert(wsEvents.some(e => e.reason === 'note-publish' && e.noteId === 'ideas'), 'WS invalidate after publish')
  console.log('✓ explicit publish → canonical ideas.md on peer B')

  const rogue = await connectTcpMeshPeer({ host: '127.0.0.1', port: Number(process.env.MESH_TCP_PORT), peerId: 'rogue' })
  const origError = console.error
  console.error = () => {} // the rejected apply logs by design
  await rogue.publish({ path: 'ideas.md', content: 'clobbered\n', mtimeMs: Date.now() + 60_000 })
  await delay(300)
  console.error = origError
  await rogue.close()
  assert(!(await readFile(join(vaultB, 'ideas.md'), 'utf-8')).includes('clobbered'), 'canonical not clobbered by sync')
  console.log('✓ canonical update over the mesh is rejected (ADR-017)')

  await daemon.close()
  daemon = undefined
  await unbindWorkspaceMeshTransport('default')
  await shutdownMeshPeers()
  delete process.env.MESH_TCP_PORT

  // --- 2. Dual-mode flip on a throwaway Git vault -------------------------------
  process.env.VAULT_PATH = vaultFlip
  const commits = () => Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: vaultFlip }).toString().trim())

  process.env.SYNC_MODE = 'git-live'
  const first = await writeToWorkspace('default', 'index', 'Home v1')
  assert(first.committed && commits() === 1, 'git-live write commits')

  process.env.SYNC_MODE = 'mesh-live'
  const mesh = await writeToWorkspace('default', 'writers/device/laptop/draft', 'Draft', { writer: 'device:laptop' })
  assert(!mesh.committed && commits() === 1, 'mesh-live write skips Git')
  const canonicalRejected = await writeToWorkspace('default', 'index', 'nope', { writer: 'device:laptop' })
    .then(() => false, (error: Error) => error.name === 'WriterPrefixViolationError')
  assert(canonicalRejected, 'mesh-live rejects canonical writes')

  process.env.SYNC_MODE = 'git-live'
  const rollback = await writeToWorkspace('default', 'index', 'Home v2')
  assert(rollback.committed && commits() === 2, 'rollback to git-live commits again')
  const tracked = execFileSync('git', ['ls-files'], { cwd: vaultFlip }).toString()
  assert(tracked.includes('writers/device/laptop/draft.md'), 'mesh-live draft exported to Git after rollback')
  console.log('✓ dual-mode flip git-live → mesh-live → git-live (rollback commits, draft kept)')

  console.log('mesh-live smoke: OK')
}
finally {
  await daemon?.close()
  await shutdownMeshPeers()
  await rm(root, { recursive: true, force: true })
}
process.exit(0)
