import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isGitHubAppConfigured: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  member: {
    id: 'memberId',
    organizationId: 'organizationId',
  },
  workspaceGithubLink: {
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
    authMode: 'authMode',
    lastSyncedAt: 'lastSyncedAt',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    gitRemoteUrl: 'gitRemoteUrl',
  },
  memberSyncMeta: {
    organizationId: 'organizationId',
    memberId: 'memberId',
    localOverride: 'localOverride',
  },
}))

vi.mock('./github-credentials', () => ({
  isGitHubAppConfigured: mocks.isGitHubAppConfigured,
  resolveWorkspaceGitHubCredentials: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
  and: (...conditions: unknown[]) => ({ __op: 'and', conditions }),
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }), {
    raw: (value: string) => value,
  }),
}))

vi.mock('@fluffmind/integrations', () => ({
  syncWorkspaceMembersFromGitHub: vi.fn(),
}))

import {
  assertWorkspaceGithubLinkAbsent,
  getWorkspaceGitHubSyncState,
  unlinkWorkspaceGithubSync,
} from './github-sync'

function mockSelectForSyncState(linkRows: unknown[]) {
  return vi.fn()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(linkRows) }),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
}

describe('getWorkspaceGitHubSyncState', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('derives syncMode local when no link exists', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(false)
    mocks.getDb.mockReturnValue({
      select: mockSelectForSyncState([]),
    })

    await expect(getWorkspaceGitHubSyncState('org_1')).resolves.toMatchObject({
      linked: false,
      syncMode: 'local',
      authMode: null,
      owner: null,
      repo: null,
    })
  })

  it('derives syncMode app from authMode', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getDb.mockReturnValue({
      select: mockSelectForSyncState([{
        owner: 'acme',
        repo: 'vault',
        authMode: 'app',
        lastSyncedAt: null,
      }]),
    })

    await expect(getWorkspaceGitHubSyncState('org_1')).resolves.toMatchObject({
      linked: true,
      syncMode: 'app',
      authMode: 'app',
      owner: 'acme',
      repo: 'vault',
    })
  })

  it('derives syncMode pat from authMode', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(false)
    mocks.getDb.mockReturnValue({
      select: mockSelectForSyncState([{
        owner: 'acme',
        repo: 'vault',
        authMode: 'pat',
        lastSyncedAt: null,
      }]),
    })

    await expect(getWorkspaceGitHubSyncState('org_1')).resolves.toMatchObject({
      linked: true,
      syncMode: 'pat',
      authMode: 'pat',
    })
  })
})

describe('assertWorkspaceGithubLinkAbsent', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('resolves when no link exists', async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    })

    await expect(assertWorkspaceGithubLinkAbsent('org_1')).resolves.toBeUndefined()
  })

  it('throws 409 when a link already exists', async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ organizationId: 'org_1' }]),
          }),
        }),
      }),
    })

    vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string, message: string }) => {
      const error = new Error(options.message) as Error & { statusCode: number, statusMessage: string }
      error.statusCode = options.statusCode
      error.statusMessage = options.statusMessage
      return error
    })

    await expect(assertWorkspaceGithubLinkAbsent('org_1')).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Sync already active',
    })
  })
})

describe('unlinkWorkspaceGithubSync', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the link, clears gitRemoteUrl, and returns local state', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(false)

    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const del = vi.fn().mockReturnValue({ where: deleteWhere })
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set: updateSet })

    mocks.getDb.mockReturnValue({
      delete: del,
      update,
      select: mockSelectForSyncState([]),
    })

    await expect(unlinkWorkspaceGithubSync('org_1')).resolves.toMatchObject({
      linked: false,
      syncMode: 'local',
      authMode: null,
    })

    expect(del).toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith({ gitRemoteUrl: null })
  })
})
