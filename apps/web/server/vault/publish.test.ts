import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
}))

vi.mock('./content-roots', () => ({
  assertWithinContentRoots: () => undefined,
}))

const {
  defaultPublishTargetId,
  isUnderWritersTree,
  publishNoteToCanonical,
} = await import('./publish')

describe('defaultPublishTargetId / isUnderWritersTree', () => {
  const writer = { kind: 'user' as const, id: 'alice' }

  it('strips the writer prefix', () => {
    expect(defaultPublishTargetId('writers/user/alice/notes/foo', writer)).toBe('notes/foo')
  })

  it('detects writers tree', () => {
    expect(isUnderWritersTree('writers/user/alice/x')).toBe(true)
    expect(isUnderWritersTree('index')).toBe(false)
  })
})

describe('publishNoteToCanonical — mesh-live', () => {
  let vaultPath: string

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-publish-'))
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

  async function seedDraft(relId: string, body: string): Promise<void> {
    const file = join(vaultPath, `${relId}.md`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, body, 'utf-8')
  }

  it('moves a draft to the canonical path without Git', async () => {
    const sourceId = 'writers/user/alice/hello'
    await seedDraft(sourceId, '# Hello\n')

    const result = await publishNoteToCanonical('ws-1', {
      sourceId,
      writer: 'user:alice',
    })

    expect(result).toEqual({
      sourceId,
      targetId: 'hello',
      committed: false,
      pushed: false,
    })
    expect(await readFile(join(vaultPath, 'hello.md'), 'utf-8')).toContain('# Hello')
    await expect(readFile(join(vaultPath, `${sourceId}.md`), 'utf-8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(mocks.commitAndPush).not.toHaveBeenCalled()
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith('ws-1')
  })

  it('rejects publishing into writers/ or from outside the prefix', async () => {
    await seedDraft('writers/user/alice/x', 'x')

    await expect(publishNoteToCanonical('ws-1', {
      sourceId: 'writers/user/alice/x',
      targetId: 'writers/user/bob/stolen',
      writer: 'user:alice',
    })).rejects.toMatchObject({ name: 'PublishTargetError' })

    await expect(publishNoteToCanonical('ws-1', {
      sourceId: 'index',
      targetId: 'published',
      writer: 'user:alice',
    })).rejects.toMatchObject({ name: 'WriterPrefixViolationError' })
  })

  it('keeps the draft when removeDraft is false', async () => {
    const sourceId = 'writers/user/alice/kept'
    await seedDraft(sourceId, 'kept\n')

    await publishNoteToCanonical('ws-1', {
      sourceId,
      targetId: 'canonical-kept',
      writer: 'user:alice',
      removeDraft: false,
    })

    expect(await readFile(join(vaultPath, 'canonical-kept.md'), 'utf-8')).toContain('kept')
    expect(await readFile(join(vaultPath, `${sourceId}.md`), 'utf-8')).toContain('kept')
  })
})
