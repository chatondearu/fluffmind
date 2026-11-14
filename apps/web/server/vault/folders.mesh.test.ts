import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureWorkingCopy: vi.fn(),
  commitAndPush: vi.fn(),
  resolveWorkspaceConfig: vi.fn(),
  resolveWorkspaceGitNetwork: vi.fn(),
  invalidateVaultIndex: vi.fn(),
  publishVaultInvalidate: vi.fn(),
  withWorkspaceLock: vi.fn(async (_id: string, run: () => Promise<unknown>) => run()),
}))

vi.mock('@fluffmind/integrations', () => ({
  ensureWorkingCopy: mocks.ensureWorkingCopy,
  commitAndPush: mocks.commitAndPush,
}))

vi.mock('./workspace', () => ({
  resolveWorkspaceConfig: mocks.resolveWorkspaceConfig,
  resolveWorkspaceGitNetwork: mocks.resolveWorkspaceGitNetwork,
}))

vi.mock('./service', () => ({
  invalidateVaultIndex: mocks.invalidateVaultIndex,
}))

vi.mock('./vault-invalidate', () => ({
  publishVaultInvalidate: mocks.publishVaultInvalidate,
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

const { createVaultFolder, FOLDER_MARKER } = await import('./folders')
const { deleteVaultFolder, renameVaultFolder } = await import('./mutations')

describe('folder mutations — mesh-live', () => {
  let vaultPath: string

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-folder-mesh-'))
    mocks.resolveWorkspaceConfig.mockResolvedValue({
      path: vaultPath,
      branch: 'main',
      contentRoots: [],
      syncMode: 'mesh-live',
    })
    mocks.resolveWorkspaceGitNetwork.mockResolvedValue({})
    mocks.commitAndPush.mockResolvedValue({ committed: true, pushed: false })
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('createVaultFolder writes marker without Git commit/push', async () => {
    await createVaultFolder('ws-1', 'projects/alpha')

    expect(await readFile(join(vaultPath, 'projects/alpha', FOLDER_MARKER), 'utf-8')).toBe('{}\n')
    expect(mocks.ensureWorkingCopy).not.toHaveBeenCalled()
    expect(mocks.commitAndPush).not.toHaveBeenCalled()
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', { reason: 'index' })
  })

  it('renameVaultFolder renames on disk without Git', async () => {
    await mkdir(join(vaultPath, 'old-name'), { recursive: true })
    await writeFile(join(vaultPath, 'old-name', FOLDER_MARKER), '{}\n', 'utf-8')

    const result = await renameVaultFolder('ws-1', 'old-name', 'new-name')

    expect(result).toMatchObject({ committed: false, pushed: false, path: 'new-name' })
    await expect(access(join(vaultPath, 'new-name', FOLDER_MARKER))).resolves.toBeUndefined()
    await expect(access(join(vaultPath, 'old-name'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(mocks.commitAndPush).not.toHaveBeenCalled()
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', { reason: 'index' })
  })

  it('deleteVaultFolder removes empty folder without Git', async () => {
    await mkdir(join(vaultPath, 'doomed'), { recursive: true })
    await writeFile(join(vaultPath, 'doomed', FOLDER_MARKER), '{}\n', 'utf-8')

    const result = await deleteVaultFolder('ws-1', 'doomed')

    expect(result).toEqual({ committed: false, pushed: false, deletedNotes: 0 })
    await expect(access(join(vaultPath, 'doomed'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(mocks.commitAndPush).not.toHaveBeenCalled()
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', { reason: 'index' })
  })
})

describe('folder mutations — git-live', () => {
  let vaultPath: string

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-folder-git-'))
    mocks.resolveWorkspaceConfig.mockResolvedValue({
      path: vaultPath,
      branch: 'main',
      contentRoots: [],
      syncMode: 'git-live',
      remoteUrl: undefined,
    })
    mocks.resolveWorkspaceGitNetwork.mockResolvedValue({})
    mocks.ensureWorkingCopy.mockResolvedValue({})
    mocks.commitAndPush.mockResolvedValue({ committed: true, pushed: false })
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('createVaultFolder still commitAndPush on git-live', async () => {
    await createVaultFolder('ws-1', 'inbox')

    expect(await readFile(join(vaultPath, 'inbox', FOLDER_MARKER), 'utf-8')).toBe('{}\n')
    expect(mocks.ensureWorkingCopy).toHaveBeenCalled()
    expect(mocks.commitAndPush).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Create folder inbox' }),
    )
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
    expect(mocks.publishVaultInvalidate).toHaveBeenCalledWith('ws-1', { reason: 'index' })
  })
})
