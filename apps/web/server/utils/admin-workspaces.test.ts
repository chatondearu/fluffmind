import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  readdir: vi.fn(),
  access: vi.fn(),
  rm: vi.fn(),
  invalidateVaultIndex: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readdir: mocks.readdir, access: mocks.access, rm: mocks.rm }
})

vi.mock('../vault/service', () => ({
  invalidateVaultIndex: mocks.invalidateVaultIndex,
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  organization: {
    id: 'id',
    name: 'name',
    slug: 'slug',
  },
  member: {
    id: 'id',
    organizationId: 'organizationId',
  },
  memberSyncMeta: {
    memberId: 'memberId',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    vaultPath: 'vaultPath',
    gitRemoteUrl: 'gitRemoteUrl',
    gitBranch: 'gitBranch',
    contentRoots: 'contentRoots',
  },
  workspaceAgentToken: {
    organizationId: 'organizationId',
  },
  workspaceGithubLink: {
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
  },
  githubInvitation: {
    organizationId: 'organizationId',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
}))

const { assertConfirmSlug, deleteAdminWorkspace, listAdminWorkspaces, rebindOrphanFolder } = await import('./admin-workspaces')

describe('assertConfirmSlug', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (options: {
      statusCode: number
      statusMessage: string
      message: string
    }) => Object.assign(new Error(options.message), options))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws 400 when slug mismatches', () => {
    expect(() => assertConfirmSlug('alpha', 'beta')).toThrow(
      expect.objectContaining({ statusCode: 400, statusMessage: 'Confirmation mismatch' }),
    )
  })

  it('passes when slug matches', () => {
    expect(() => assertConfirmSlug('alpha', 'alpha')).not.toThrow()
  })
})

describe('listAdminWorkspaces', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (options: {
      statusCode: number
      statusMessage: string
      message: string
    }) => Object.assign(new Error(options.message), options))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete process.env.WORKSPACES_ROOT
  })

  it('returns workspaces and orphan folder names', async () => {
    process.env.WORKSPACES_ROOT = '/data/workspaces'
    mocks.readdir.mockResolvedValue(['org-1', 'org-orphan', '.fluffmind-locks'])
    mocks.access.mockImplementation(async (p: string) => {
      if (String(p).includes('org-1'))
        return undefined
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const rows = [{
      organizationId: 'org-1',
      name: 'Alpha',
      slug: 'alpha',
      vaultPath: '/data/workspaces/org-1',
      gitRemoteUrl: 'https://github.com/acme/alpha.git',
      gitBranch: 'main',
      contentRoots: [],
      githubOwner: 'acme',
      githubRepo: 'alpha',
    }]

    const leftJoin2 = vi.fn().mockResolvedValue(rows)
    const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 })
    const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 })
    const select = vi.fn().mockReturnValue({ from })
    mocks.getDb.mockReturnValue({ select })

    const result = await listAdminWorkspaces()
    expect(result.workspaces).toHaveLength(1)
    expect(result.workspaces[0]!.vaultExists).toBe(true)
    expect(result.workspaces[0]!.githubLinked).toBe(true)
    expect(result.orphans).toEqual(['org-orphan'])
  })
})

describe('deleteAdminWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (options: {
      statusCode: number
      statusMessage: string
      message: string
    }) => Object.assign(new Error(options.message), options))
    process.env.WORKSPACES_ROOT = '/data/workspaces'
    mocks.rm.mockResolvedValue(undefined)
    mocks.invalidateVaultIndex.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete process.env.WORKSPACES_ROOT
  })

  function mockDeleteChain() {
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere })
    return { delete: deleteFn, deleteWhere }
  }

  it('deleteAdminWorkspace removes tokens, link, config, org, and vault dir', async () => {
    const orgId = 'org-1'
    const vaultPath = '/data/workspaces/org-1'
    const { delete: deleteFn, deleteWhere } = mockDeleteChain()

    const configLimit = vi.fn().mockResolvedValue([{ vaultPath }])
    const configWhere = vi.fn().mockReturnValue({ limit: configLimit })
    const configFrom = vi.fn().mockReturnValue({ where: configWhere })

    const membersWhere = vi.fn().mockResolvedValue([{ id: 'member-1' }])
    const membersFrom = vi.fn().mockReturnValue({ where: membersWhere })

    const select = vi.fn()
      .mockReturnValueOnce({ from: configFrom })
      .mockReturnValueOnce({ from: membersFrom })

    mocks.getDb.mockReturnValue({ select, delete: deleteFn })

    await deleteAdminWorkspace(orgId)

    expect(deleteFn).toHaveBeenCalledTimes(6)
    expect(deleteWhere).toHaveBeenCalledTimes(6)
    expect(mocks.rm).toHaveBeenCalledWith(vaultPath, { recursive: true, force: true })
    expect(mocks.invalidateVaultIndex).toHaveBeenCalledWith(orgId)
  })

  it('rejects vaultPath that escapes WORKSPACES_ROOT', async () => {
    const orgId = 'org-1'
    const configLimit = vi.fn().mockResolvedValue([{ vaultPath: '/etc/passwd' }])
    const configWhere = vi.fn().mockReturnValue({ limit: configLimit })
    const configFrom = vi.fn().mockReturnValue({ where: configWhere })
    const select = vi.fn().mockReturnValue({ from: configFrom })
    mocks.getDb.mockReturnValue({ select, delete: vi.fn() })

    await expect(deleteAdminWorkspace(orgId)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid path',
    })
    expect(mocks.rm).not.toHaveBeenCalled()
    expect(mocks.invalidateVaultIndex).not.toHaveBeenCalled()
  })
})

describe('rebindOrphanFolder', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (options: {
      statusCode: number
      statusMessage: string
      message: string
    }) => Object.assign(new Error(options.message), options))
    process.env.WORKSPACES_ROOT = '/data/workspaces'
    mocks.access.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete process.env.WORKSPACES_ROOT
  })

  it('rejects folderName containing ..', async () => {
    mocks.getDb.mockReturnValue({ select: vi.fn() })

    await expect(rebindOrphanFolder({ organizationId: 'org-1', folderName: '../escape' }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid path' })

    expect(mocks.getDb).not.toHaveBeenCalled()
  })

  it('rejects unknown organization', async () => {
    const limit = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    mocks.getDb.mockReturnValue({ select })

    await expect(rebindOrphanFolder({ organizationId: 'missing-org', folderName: 'org-orphan' }))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Workspace not found' })
  })

  it('upserts workspaceConfig with orphan folder vaultPath', async () => {
    const orgId = 'org-1'
    const folderName = 'org-orphan'
    const vaultPath = '/data/workspaces/org-orphan'

    const limit = vi.fn().mockResolvedValue([{ id: orgId, slug: 'alpha' }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values })

    mocks.getDb.mockReturnValue({ select, insert })

    const result = await rebindOrphanFolder({ organizationId: orgId, folderName })

    expect(mocks.access).toHaveBeenCalledWith(vaultPath)
    expect(insert).toHaveBeenCalled()
    expect(values).toHaveBeenCalledWith({
      organizationId: orgId,
      vaultPath,
      gitRemoteUrl: null,
      gitBranch: 'main',
      contentRoots: [],
    })
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: expect.anything(),
      set: { vaultPath },
    })
    expect(result).toEqual({ vaultPath })
  })
})
