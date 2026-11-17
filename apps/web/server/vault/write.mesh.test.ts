import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureWorkingCopy: vi.fn(),
  commitAndPush: vi.fn(),
  resolveWorkspaceConfig: vi.fn(),
  resolveWorkspaceGitNetwork: vi.fn(),
  invalidateVaultIndex: vi.fn(),
  withWorkspaceLock: vi.fn(async (_id: string, run: () => Promise<unknown>) => run()),
  publishLocalMeshNote: vi.fn(),
}))

vi.mock('@fluffmind/integrations', () => ({
  ensureWorkingCopy: mocks.ensureWorkingCopy,
  commitAndPush: mocks.commitAndPush,
  GitConflictError: class GitConflictError extends Error {
    name = 'GitConflictError'
  },
}))

vi.mock('./workspace', () => ({
  resolveWorkspaceConfig: mocks.resolveWorkspaceConfig,
  resolveWorkspaceGitNetwork: mocks.resolveWorkspaceGitNetwork,
}))

vi.mock('./service', () => ({
  invalidateVaultIndex: mocks.invalidateVaultIndex,
}))

vi.mock('./vault-invalidate', () => ({
  publishVaultInvalidate: vi.fn(),
}))

vi.mock('./lock', () => ({
  withWorkspaceLock: mocks.withWorkspaceLock,
  WorkspaceLockTimeoutError: class WorkspaceLockTimeoutError extends Error {
    name = 'WorkspaceLockTimeoutError'
  },
}))

vi.mock('./content-roots', () => ({
  assertWithinContentRoots: () => undefined,
}))

vi.mock('./mesh-apply', () => ({
  publishLocalMeshNote: mocks.publishLocalMeshNote,
}))

const { writeToWorkspace } = await import('./write')

describe('writeToWorkspace — mesh-live', () => {
  let vaultPath: string

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-mesh-write-'))
    mocks.resolveWorkspaceConfig.mockResolvedValue({
      path: vaultPath,
      branch: 'main',
      contentRoots: [],
      syncMode: 'mesh-live',
    })
    mocks.resolveWorkspaceGitNetwork.mockResolvedValue({})
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('writes under the writer prefix without Git commit/push', async () => {
    const id = 'writers/user/alice/hello'
    const result = await writeToWorkspace('ws-1', id, 'Hello mesh', {
      writer: 'user:alice',
    })

    expect(result).toMatchObject({ committed: false, pushed: false })
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(await readFile(join(vaultPath, `${id}.md`), 'utf-8')).toContain('Hello mesh')
    expect(mocks.ensureWorkingCopy).not.toHaveBeenCalled()
    expect(mocks.commitAndPush).not.toHaveBeenCalled()
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
    expect(mocks.publishLocalMeshNote).toHaveBeenCalledWith('ws-1', id, expect.stringContaining('Hello mesh'), { writer: 'user:alice' })
  })

  it('rejects canonical paths and missing writer on mesh-live', async () => {
    await expect(writeToWorkspace('ws-1', 'index', 'nope', { writer: 'user:alice' }))
      .rejects.toMatchObject({ name: 'WriterPrefixViolationError' })

    await expect(writeToWorkspace('ws-1', 'writers/user/alice/x', 'nope'))
      .rejects.toMatchObject({ name: 'InvalidWriterIdentityError' })
  })

  it('rejects another writer\'s prefix', async () => {
    await expect(writeToWorkspace('ws-1', 'writers/user/bob/x', 'nope', { writer: 'user:alice' }))
      .rejects.toMatchObject({ name: 'WriterPrefixViolationError' })
    await expect(writeToWorkspace('ws-1', 'writers/agent/alice/x', 'nope', { writer: 'user:alice' }))
      .rejects.toMatchObject({ name: 'WriterPrefixViolationError' })
    expect(mocks.publishLocalMeshNote).not.toHaveBeenCalled()
  })
})

describe('writeToWorkspace — git-live (unchanged)', () => {
  let vaultPath: string

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-git-write-'))
    mocks.resolveWorkspaceConfig.mockResolvedValue({
      path: vaultPath,
      branch: 'main',
      contentRoots: [],
      syncMode: 'git-live',
    })
    mocks.resolveWorkspaceGitNetwork.mockResolvedValue({})
    mocks.ensureWorkingCopy.mockResolvedValue({})
    mocks.commitAndPush.mockResolvedValue({ committed: true, pushed: false })
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('commits canonical writes without a writer and never publishes to the mesh', async () => {
    const result = await writeToWorkspace('ws-1', 'index', 'Root page')

    expect(result).toMatchObject({ committed: true, pushed: false })
    expect(mocks.commitAndPush).toHaveBeenCalledWith({}, expect.objectContaining({ message: 'Create index' }))
    expect(mocks.publishLocalMeshNote).not.toHaveBeenCalled()
  })
})
