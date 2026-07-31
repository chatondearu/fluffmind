import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  readdir: vi.fn(),
  access: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readdir: mocks.readdir, access: mocks.access }
})

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  organization: {
    id: 'id',
    name: 'name',
    slug: 'slug',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    vaultPath: 'vaultPath',
    gitRemoteUrl: 'gitRemoteUrl',
    gitBranch: 'gitBranch',
    contentRoots: 'contentRoots',
  },
  workspaceGithubLink: {
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
}))

const { assertConfirmSlug, listAdminWorkspaces } = await import('./admin-workspaces')

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
