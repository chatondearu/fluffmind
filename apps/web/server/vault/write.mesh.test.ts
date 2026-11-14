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
  })

  it('rejects canonical paths and missing writer on mesh-live', async () => {
    await expect(writeToWorkspace('ws-1', 'index', 'nope', { writer: 'user:alice' }))
      .rejects.toMatchObject({ name: 'WriterPrefixViolationError' })

    await expect(writeToWorkspace('ws-1', 'writers/user/alice/x', 'nope'))
      .rejects.toMatchObject({ name: 'InvalidWriterIdentityError' })
  })
})
