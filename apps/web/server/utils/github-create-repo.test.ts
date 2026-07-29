import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createAndLinkGithubRepo,
  defaultGithubRepoName,
  parseCreateGithubRepoBody,
} from './github-create-repo'

const mocks = vi.hoisted(() => ({
  createGithubRepository: vi.fn(),
  createInstallationToken: vi.fn(),
  buildGitHubHttpsRemoteUrl: vi.fn(),
  findGithubAppInstallation: vi.fn(),
  getGitHubAppCredentials: vi.fn(),
  isGitHubAppConfigured: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  workspaceGithubLink: {
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
    authMode: 'authMode',
    installationId: 'installationId',
    syncToken: 'syncToken',
    lastSyncedAt: 'lastSyncedAt',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    gitRemoteUrl: 'gitRemoteUrl',
  },
}))

vi.mock('@fluffmind/integrations', () => ({
  createGithubRepository: mocks.createGithubRepository,
  createInstallationToken: mocks.createInstallationToken,
  buildGitHubHttpsRemoteUrl: mocks.buildGitHubHttpsRemoteUrl,
  GithubApiError: class GithubApiError extends Error {
    status: number
    githubMessage: string

    constructor(status: number, githubMessage: string) {
      super(githubMessage)
      this.status = status
      this.githubMessage = githubMessage
    }
  },
}))

vi.mock('./github-credentials', () => ({
  getGitHubAppCredentials: mocks.getGitHubAppCredentials,
  isGitHubAppConfigured: mocks.isGitHubAppConfigured,
}))

vi.mock('./github-installations', () => ({
  findGithubAppInstallation: mocks.findGithubAppInstallation,
}))

describe('defaultGithubRepoName', () => {
  it('prefixes fluff-', () => {
    expect(defaultGithubRepoName('handbook')).toBe('fluff-handbook')
  })
})

describe('parseCreateGithubRepoBody', () => {
  it('requires installationId', () => {
    expect(parseCreateGithubRepoBody({ installationId: '12', name: 'x' })).toEqual({
      installationId: '12',
      name: 'x',
      private: undefined,
    })
    expect(parseCreateGithubRepoBody(false)).toBeNull()
    expect(parseCreateGithubRepoBody({})).toBeNull()
  })
})

describe('createAndLinkGithubRepo', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok:false on GithubApiError without throwing', async () => {
    const { GithubApiError } = await import('@fluffmind/integrations')
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getGitHubAppCredentials.mockReturnValue({ appId: '1', privateKey: 'k' })
    mocks.findGithubAppInstallation.mockResolvedValue({
      installationId: '99',
      accountLogin: 'acme',
      accountType: 'Organization',
    })
    mocks.createInstallationToken.mockResolvedValue({ token: 'ghs_x', expiresAt: 't' })
    mocks.createGithubRepository.mockRejectedValue(new GithubApiError(422, 'name already exists'))
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    })

    await expect(
      createAndLinkGithubRepo({
        workspaceId: 'org_1',
        workspaceSlug: 'docs',
        input: { installationId: '99' },
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'name already exists',
    })
  })

  it('inserts link and remote on success', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getGitHubAppCredentials.mockReturnValue({ appId: '1', privateKey: 'k' })
    mocks.findGithubAppInstallation.mockResolvedValue({
      installationId: '99',
      accountLogin: 'acme',
      accountType: 'Organization',
    })
    mocks.createInstallationToken.mockResolvedValue({ token: 'ghs_x', expiresAt: 't' })
    mocks.createGithubRepository.mockResolvedValue({
      owner: 'acme',
      repo: 'fluff-docs',
      htmlUrl: 'https://github.com/acme/fluff-docs',
      cloneUrl: 'https://github.com/acme/fluff-docs.git',
    })
    mocks.buildGitHubHttpsRemoteUrl.mockReturnValue('https://github.com/acme/fluff-docs.git')

    const insertValues = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn().mockReturnValue({ values: insertValues })
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set: updateSet })
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert,
      update,
    })

    await expect(
      createAndLinkGithubRepo({
        workspaceId: 'org_1',
        workspaceSlug: 'docs',
        input: { installationId: '99' },
      }),
    ).resolves.toEqual({
      ok: true,
      owner: 'acme',
      repo: 'fluff-docs',
      htmlUrl: 'https://github.com/acme/fluff-docs',
    })

    expect(mocks.createGithubRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fluff-docs',
        private: true,
        autoInit: false,
        accountType: 'Organization',
        accountLogin: 'acme',
      }),
    )
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        owner: 'acme',
        repo: 'fluff-docs',
        authMode: 'app',
        installationId: '99',
        syncToken: null,
      }),
    )
  })

  it('throws 409 when a sync link already exists', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getGitHubAppCredentials.mockReturnValue({ appId: '1', privateKey: 'k' })
    mocks.findGithubAppInstallation.mockResolvedValue({
      installationId: '99',
      accountLogin: 'acme',
      accountType: 'Organization',
    })
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

    await expect(
      createAndLinkGithubRepo({
        workspaceId: 'org_1',
        workspaceSlug: 'docs',
        input: { installationId: '99' },
        refuseIfLinked: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Sync already active',
    })

    expect(mocks.createGithubRepository).not.toHaveBeenCalled()
  })
})
