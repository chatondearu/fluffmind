import { mkdtemp, readFile, rm, utimes, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryMeshHub } from '@fluffmind/integrations'

const mocks = vi.hoisted(() => ({
  resolveWorkspaceConfig: vi.fn(),
  invalidateVaultIndex: vi.fn(),
  publishVaultInvalidate: vi.fn(),
}))

vi.mock('./workspace', () => ({
  resolveWorkspaceConfig: mocks.resolveWorkspaceConfig,
}))

vi.mock('./service', () => ({
  invalidateVaultIndex: mocks.invalidateVaultIndex,
}))

vi.mock('./vault-invalidate', () => ({
  publishVaultInvalidate: mocks.publishVaultInvalidate,
}))

vi.mock('./content-roots', () => ({
  assertWithinContentRoots: () => undefined,
}))

const {
  applyMeshFileUpdate,
  bindWorkspaceMeshTransport,
  meshPathForNoteId,
  noteIdFromMeshPath,
  publishLocalMeshNote,
  unbindWorkspaceMeshTransport,
} = await import('./mesh-apply')

describe('mesh-apply', () => {
  let vaultPath: string

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-mesh-apply-'))
    mocks.resolveWorkspaceConfig.mockResolvedValue({
      path: vaultPath,
      branch: 'main',
      contentRoots: [],
      syncMode: 'mesh-live',
    })
  })

  afterEach(async () => {
    await unbindWorkspaceMeshTransport('ws-1')
    vi.clearAllMocks()
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('maps note ids to mesh paths', () => {
    expect(meshPathForNoteId('writers/user/a/x')).toBe('writers/user/a/x.md')
    expect(noteIdFromMeshPath('writers/user/a/x.md')).toBe('writers/user/a/x')
  })

  it('publishes local writes to a bound MeshSyncTransport peer', async () => {
    const hub = createInMemoryMeshHub()
    const local = hub.join('local')
    const remote = hub.join('remote')
    bindWorkspaceMeshTransport('ws-1', local)

    const pending = new Promise<{ path: string, content: string }>((resolve) => {
      remote.onUpdate(u => resolve(u))
    })

    await publishLocalMeshNote('ws-1', 'writers/user/a/hello', '# hi\n', 42)
    const got = await pending
    expect(got).toMatchObject({
      path: 'writers/user/a/hello.md',
      content: '# hi\n',
      mtimeMs: 42,
      peerId: 'local',
    })

    await remote.close()
  })

  it('applies remote updates to disk and invalidates', async () => {
    const result = await applyMeshFileUpdate('ws-1', {
      path: 'writers/user/a/from-peer.md',
      content: 'remote body\n',
      mtimeMs: 1_700_000_000_000,
      peerId: 'other',
    })

    expect(result).toEqual({ applied: true, noteId: 'writers/user/a/from-peer' })
    const onDisk = await readFile(join(vaultPath, 'writers/user/a/from-peer.md'), 'utf-8')
    expect(onDisk).toBe('remote body\n')
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', {
      reason: 'note-write',
      noteId: 'writers/user/a/from-peer',
    })
  })

  it('skips apply when local mtime is newer (LWW)', async () => {
    const noteId = 'writers/user/a/newer'
    const filePath = join(vaultPath, `${noteId}.md`)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, 'local\n', 'utf-8')
    const recent = Date.now()
    await utimes(filePath, new Date(recent), new Date(recent))

    const result = await applyMeshFileUpdate('ws-1', {
      path: `${noteId}.md`,
      content: 'stale remote\n',
      mtimeMs: recent - 60_000,
      peerId: 'other',
    })

    expect(result.applied).toBe(false)
    expect(await readFile(filePath, 'utf-8')).toBe('local\n')
  })
})
