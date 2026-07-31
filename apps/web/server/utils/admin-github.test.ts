import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  githubAppInstallation: {
    id: 'id',
    installationId: 'installationId',
    accountLogin: 'accountLogin',
    accountType: 'accountType',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  workspaceGithubLink: {
    organizationId: 'organizationId',
    installationId: 'installationId',
    owner: 'owner',
    repo: 'repo',
  },
  organization: { id: 'id', name: 'name', slug: 'slug' },
  workspaceConfig: { organizationId: 'organizationId', gitRemoteUrl: 'gitRemoteUrl' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
}))

const { assertConfirmInstallationId, listAdminGithubInstallations, unlinkAllWorkspacesForInstallation }
  = await import('./admin-github')

beforeEach(() => {
  vi.stubGlobal('createError', (options: Record<string, unknown>) => {
    const error = new Error(String(options.message || options.statusMessage))
    Object.assign(error, options)
    return error
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('assertConfirmInstallationId', () => {
  it('throws 400 when id mismatches', () => {
    expect(() => assertConfirmInstallationId('123', '456')).toThrow(
      expect.objectContaining({ statusCode: 400, statusMessage: 'Confirmation mismatch' }),
    )
  })

  it('passes when id matches', () => {
    expect(() => assertConfirmInstallationId('123', '123')).not.toThrow()
  })
})

describe('listAdminGithubInstallations', () => {
  it('returns installations with linked workspaces', async () => {
    const installationRow = {
      id: 'inst-uuid',
      installationId: '123',
      accountLogin: 'acme',
      accountType: 'Organization',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    }

    const linkRows = [{
      installationId: '123',
      organizationId: 'org-1',
      owner: 'acme',
      repo: 'handbook',
      name: 'Alpha',
      slug: 'alpha',
    }]

    mocks.getDb.mockReturnValue({
      select: vi.fn()
        .mockImplementationOnce(() => ({ from: vi.fn().mockResolvedValue([installationRow]) }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockResolvedValue(linkRows),
          }),
        })),
    })

    const result = await listAdminGithubInstallations()

    expect(result).toHaveLength(1)
    expect(result[0]!.installationId).toBe('123')
    expect(result[0]!.linkedWorkspaces).toEqual([
      expect.objectContaining({ organizationId: 'org-1', slug: 'alpha', owner: 'acme', repo: 'handbook' }),
    ])
  })
})

describe('unlinkAllWorkspacesForInstallation', () => {
  function mockUnlinkChain(options: {
    existingInstallation: boolean
    linkedOrgs: Array<{ organizationId: string }>
  }) {
    const deleteCalls: Array<{ table: unknown, condition: unknown }> = []
    const updateCalls: Array<{ set: unknown, whereOrgId: unknown }> = []

    const deleteFn = vi.fn((table: unknown) => ({
      where: vi.fn((condition: unknown) => {
        deleteCalls.push({ table, condition })
        return Promise.resolve()
      }),
    }))

    const updateFn = vi.fn(() => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn((condition: unknown) => {
          updateCalls.push({ set: values, whereOrgId: condition })
          return Promise.resolve()
        }),
      })),
    }))

    let selectCall = 0
    const select = vi.fn(() => {
      selectCall += 1
      if (selectCall === 1) {
        const limit = vi.fn().mockResolvedValue(
          options.existingInstallation ? [{ installationId: '123' }] : [],
        )
        const where = vi.fn().mockReturnValue({ limit })
        const from = vi.fn().mockReturnValue({ where })
        return { from }
      }
      const where = vi.fn().mockResolvedValue(options.linkedOrgs)
      const from = vi.fn().mockReturnValue({ where })
      return { from }
    })

    mocks.getDb.mockReturnValue({ select, delete: deleteFn, update: updateFn })
    return { deleteCalls, updateCalls, deleteFn }
  }

  it('deletes links and clears gitRemoteUrl but does not delete installation', async () => {
    const { deleteCalls, updateCalls, deleteFn } = mockUnlinkChain({
      existingInstallation: true,
      linkedOrgs: [{ organizationId: 'org-1' }],
    })

    const result = await unlinkAllWorkspacesForInstallation('123')

    expect(result.unlinked).toBe(1)
    expect(deleteFn).toHaveBeenCalledTimes(1)
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0]!.table).toEqual({
      organizationId: 'organizationId',
      installationId: 'installationId',
      owner: 'owner',
      repo: 'repo',
    })
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]!.set).toEqual({ gitRemoteUrl: null })
  })

  it('throws 404 when installation missing', async () => {
    mockUnlinkChain({ existingInstallation: false, linkedOrgs: [] })

    await expect(unlinkAllWorkspacesForInstallation('missing')).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Installation not found',
    })
  })
})
