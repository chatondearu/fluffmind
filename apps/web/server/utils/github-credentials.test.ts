import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createInstallationToken: vi.fn(),
  decryptSyncToken: vi.fn(),
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  workspaceGithubLink: {
    authMode: 'authMode',
    installationId: 'installationId',
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
    syncToken: 'syncToken',
  },
}))

vi.mock('@fluffmind/integrations', () => ({
  createInstallationToken: mocks.createInstallationToken,
}))

vi.mock('./github-token-crypto', () => ({
  decryptSyncToken: mocks.decryptSyncToken,
}))

import {
  isGitHubAppConfigured,
  resolveWorkspaceGitHubCredentials,
} from './github-credentials'

function mockGitHubLink(link: Record<string, unknown> | undefined): void {
  const limit = vi.fn().mockResolvedValue(link ? [link] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  mocks.getDb.mockReturnValue({ select })
}

describe('isGitHubAppConfigured', () => {
  afterEach(() => {
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_APP_PRIVATE_KEY
  })

  it('requires both GitHub App environment variables', () => {
    process.env.GITHUB_APP_ID = '123'
    expect(isGitHubAppConfigured()).toBe(false)

    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nkey'
    expect(isGitHubAppConfigured()).toBe(true)
  })
})

describe('resolveWorkspaceGitHubCredentials', () => {
  afterEach(() => {
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_APP_PRIVATE_KEY
    vi.clearAllMocks()
  })

  it('returns null when the workspace is not linked', async () => {
    mockGitHubLink(undefined)

    await expect(resolveWorkspaceGitHubCredentials('org-1')).resolves.toBeNull()
  })

  it('mints an installation token for an App link', async () => {
    process.env.GITHUB_APP_ID = '123'
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nkey'
    mockGitHubLink({
      authMode: 'app',
      installationId: '456',
      owner: 'acme',
      repo: 'vault',
      syncToken: null,
    })
    mocks.createInstallationToken.mockResolvedValue({
      token: 'ghs_token',
      expiresAt: '2026-07-24T18:00:00.000Z',
    })

    await expect(resolveWorkspaceGitHubCredentials('org-1')).resolves.toEqual({
      mode: 'app',
      token: 'ghs_token',
      owner: 'acme',
      repo: 'vault',
      installationId: '456',
    })
    expect(mocks.createInstallationToken).toHaveBeenCalledWith({
      appId: '123',
      privateKey: '-----BEGIN PRIVATE KEY-----\nkey',
    }, '456')
  })

  it('decrypts the stored token for a PAT link', async () => {
    mockGitHubLink({
      authMode: 'pat',
      installationId: null,
      owner: 'acme',
      repo: 'vault',
      syncToken: 'enc:v1:token',
    })
    mocks.decryptSyncToken.mockReturnValue('ghp_token')

    await expect(resolveWorkspaceGitHubCredentials('org-1')).resolves.toEqual({
      mode: 'pat',
      token: 'ghp_token',
      owner: 'acme',
      repo: 'vault',
    })
    expect(mocks.decryptSyncToken).toHaveBeenCalledWith('enc:v1:token')
  })
})
