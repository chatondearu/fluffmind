import { mkdtemp, readFile, rm, utimes, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryMeshHub, type MeshFileUpdate } from '@fluffmind/integrations'

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

    const pending = new Promise<MeshFileUpdate>((resolve) => {
      remote.onUpdate(u => resolve(u))
    })

    await publishLocalMeshNote('ws-1', 'writers/user/a/hello', '# hi\n', { writer: 'user:a', mtimeMs: 42 })
    const got = await pending
    expect(got).toMatchObject({
      path: 'writers/user/a/hello.md',
      content: '# hi\n',
      mtimeMs: 42,
      peerId: 'local',
      writer: 'user:a',
      published: false,
      deleted: false,
    })

    // Canonical paths always carry published: true; tombstones set deleted.
    const tombstone = new Promise<MeshFileUpdate>(resolve => remote.onUpdate(resolve))
    await publishLocalMeshNote('ws-1', 'notes/a', '', { writer: 'user:a', deleted: true })
    expect(await tombstone).toMatchObject({ path: 'notes/a.md', published: true, deleted: true })

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

  it('refuses canonical paths — sync alone cannot clobber root (ADR-017)', async () => {
    const canonical = join(vaultPath, 'index.md')
    await writeFile(canonical, 'canonical\n', 'utf-8')

    await expect(applyMeshFileUpdate('ws-1', {
      path: 'index.md',
      content: 'clobbered\n',
      mtimeMs: Date.now() + 60_000,
      peerId: 'other',
    })).rejects.toMatchObject({ name: 'WriterPrefixViolationError' })

    expect(await readFile(canonical, 'utf-8')).toBe('canonical\n')
    await expect(applyMeshFileUpdate('ws-1', {
      path: 'writers.md',
      content: 'root file\n',
      mtimeMs: Date.now(),
      peerId: 'other',
    })).rejects.toMatchObject({ name: 'WriterPrefixViolationError' })
    expect(mocks.publishVaultInvalidate).not.toHaveBeenCalled()
  })

  it('persisted updates only invalidate — the daemon already wrote the file', async () => {
    const canonical = join(vaultPath, 'notes/a.md')
    await mkdir(dirname(canonical), { recursive: true })
    await writeFile(canonical, 'daemon wrote this\n', 'utf-8')

    const result = await applyMeshFileUpdate('ws-1', {
      path: 'notes/a.md',
      content: '',
      mtimeMs: 1,
      peerId: 'daemon:ws-1',
      persisted: true,
    })
    await applyMeshFileUpdate('ws-1', {
      path: 'writers/user/a/gone.md',
      content: '',
      mtimeMs: 1,
      peerId: 'daemon:ws-1',
      persisted: true,
      deleted: true,
    })

    expect(result).toEqual({ applied: true, noteId: 'notes/a' })
    expect(await readFile(canonical, 'utf-8')).toBe('daemon wrote this\n')
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledTimes(2)
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', { reason: 'note-write', noteId: 'notes/a' })
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', { reason: 'note-write', noteId: 'writers/user/a/gone' })
  })

  it('ignores persisted updates on a git-live workspace', async () => {
    mocks.resolveWorkspaceConfig.mockResolvedValue({ path: vaultPath, branch: 'main', contentRoots: [], syncMode: 'git-live' })
    const result = await applyMeshFileUpdate('ws-1', { path: 'notes/a.md', content: '', mtimeMs: 1, peerId: 'd', persisted: true })
    expect(result.applied).toBe(false)
    expect(mocks.publishVaultInvalidate).not.toHaveBeenCalled()
  })

  it('does not apply remote updates on a git-live workspace', async () => {
    mocks.resolveWorkspaceConfig.mockResolvedValue({
      path: vaultPath,
      branch: 'main',
      contentRoots: [],
      syncMode: 'git-live',
    })

    const result = await applyMeshFileUpdate('ws-1', {
      path: 'writers/user/a/late.md',
      content: 'x\n',
      mtimeMs: Date.now(),
      peerId: 'other',
    })

    expect(result.applied).toBe(false)
    await expect(readFile(join(vaultPath, 'writers/user/a/late.md'), 'utf-8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('applies a peer update end-to-end through a bound transport (no echo)', async () => {
    const hub = createInMemoryMeshHub()
    const local = hub.join('local')
    const remote = hub.join('remote')
    bindWorkspaceMeshTransport('ws-1', local)
    const echoes: unknown[] = []
    remote.onUpdate(u => echoes.push(u))

    const invalidated = new Promise<void>((resolve) => {
      mocks.publishVaultInvalidate.mockImplementationOnce(() => resolve())
    })
    await remote.publish({ path: 'writers/user/b/peer.md', content: 'from b\n', mtimeMs: 1_700_000_000_000 })
    await invalidated

    expect(await readFile(join(vaultPath, 'writers/user/b/peer.md'), 'utf-8')).toBe('from b\n')
    expect(echoes).toEqual([])
    await remote.close()
  })
})
