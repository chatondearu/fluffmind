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

const { resolveWorkspaceGitRemoteUrl } = await import('./workspace')

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

  it('preserves the configured remote URL when no linked credentials exist', async () => {
    mockWorkspaceConfig('https://github.com/acme/vault.git')
    mocks.resolveWorkspaceGitHubCredentials.mockResolvedValue(null)

    await expect(resolveWorkspaceGitRemoteUrl('org-1')).resolves.toBe(
      'https://github.com/acme/vault.git',
    )
  })
})
