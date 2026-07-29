import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  resolveWorkspaceGitHubCredentials: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  member: {
    organizationId: 'organizationId',
    userId: 'userId',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
  },
}))

vi.mock('../utils/auth', () => ({
  isAuthEnabled: () => true,
  requireSession: vi.fn(),
}))

vi.mock('../utils/github-credentials', () => ({
  resolveWorkspaceGitHubCredentials: mocks.resolveWorkspaceGitHubCredentials,
}))

const { resolveWorkspaceGitNetwork, resolveWorkspaceGitRemoteUrl } = await import('./workspace')

function mockWorkspaceConfig(remoteUrl?: string): void {
  const limit = vi.fn().mockResolvedValue([{
    vaultPath: '/tmp/fluffmind-workspace-test/org-1',
    gitRemoteUrl: remoteUrl ?? null,
    gitBranch: 'main',
  }])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  mocks.getDb.mockReturnValue({ select })
}

describe('resolveWorkspaceGitNetwork', () => {
  beforeEach(() => {
    process.env.WORKSPACES_ROOT = '/tmp/fluffmind-workspace-test'
    vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string, message: string }) => {
      const error = new Error(options.message) as Error & { statusCode: number, statusMessage: string }
      error.statusCode = options.statusCode
      error.statusMessage = options.statusMessage
      return error
    })
  })

  afterEach(() => {
    delete process.env.WORKSPACES_ROOT
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns clean remote + access token for linked workspaces', async () => {
    mockWorkspaceConfig('https://github.com/acme/vault.git')
    mocks.resolveWorkspaceGitHubCredentials.mockResolvedValue({
      mode: 'app',
      token: 'ghs_token',
      owner: 'acme',
      repo: 'vault',
    })

    await expect(resolveWorkspaceGitNetwork('org-1')).resolves.toEqual({
      remoteUrl: 'https://github.com/acme/vault.git',
      accessToken: 'ghs_token',
    })
  })

  it('throws when a GitHub remote has no App/PAT credentials', async () => {
    mockWorkspaceConfig('https://github.com/acme/vault.git')
    mocks.resolveWorkspaceGitHubCredentials.mockResolvedValue(null)

    await expect(resolveWorkspaceGitNetwork('org-1')).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'GitHub credentials unavailable',
    })
  })
})

describe('resolveWorkspaceGitRemoteUrl', () => {
  beforeEach(() => {
    process.env.WORKSPACES_ROOT = '/tmp/fluffmind-workspace-test'
  })

  afterEach(() => {
    delete process.env.WORKSPACES_ROOT
    vi.clearAllMocks()
  })

  it('injects the linked workspace token only into the runtime remote URL', async () => {
    mockWorkspaceConfig('https://github.com/acme/vault.git')
    mocks.resolveWorkspaceGitHubCredentials.mockResolvedValue({
      mode: 'app',
      token: 'ghs_token',
      owner: 'acme',
      repo: 'vault',
    })

    await expect(resolveWorkspaceGitRemoteUrl('org-1')).resolves.toBe(
      'https://x-access-token:ghs_token@github.com/acme/vault.git',
    )
  })
})
