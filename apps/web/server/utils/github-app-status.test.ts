import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAppJwt: vi.fn(),
  getGitHubAppCredentials: vi.fn(),
  isGitHubAppConfigured: vi.fn(),
}))

vi.mock('@fluffmind/integrations', async () => {
  const actual = await vi.importActual<typeof import('@fluffmind/integrations')>('@fluffmind/integrations')
  return {
    ...actual,
    createAppJwt: mocks.createAppJwt,
  }
})

vi.mock('./github-credentials', () => ({
  getGitHubAppCredentials: mocks.getGitHubAppCredentials,
  isGitHubAppConfigured: mocks.isGitHubAppConfigured,
}))

const { fetchGitHubAppStatus } = await import('./github-app-status')

describe('fetchGitHubAppStatus', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete process.env.GITHUB_APP_SLUG
    delete process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_SECRET
    delete process.env.GITHUB_APP_WEBHOOK_SECRET
  })

  it('returns unchecked permissions when the app is not configured', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(false)

    const status = await fetchGitHubAppStatus()

    expect(status.configured).toBe(false)
    expect(status.requiredOk).toBe(false)
    expect(status.checks.some(check => check.key === 'contents' && !check.ok)).toBe(true)
  })

  it('evaluates permissions returned by GET /app', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(true)
    mocks.getGitHubAppCredentials.mockReturnValue({ appId: '1', privateKey: 'key' })
    mocks.createAppJwt.mockResolvedValue({ token: 'jwt', expiresAt: '2026-07-29T00:00:00Z' })
    process.env.GITHUB_APP_SLUG = 'fluff'
    process.env.GITHUB_CLIENT_ID = 'iv1'
    process.env.GITHUB_CLIENT_SECRET = 'secret'
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'hook'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        permissions: {
          contents: 'write',
          metadata: 'read',
          members: 'read',
          administration: 'write',
          emails: 'read',
        },
      }),
    }))

    const status = await fetchGitHubAppStatus()

    expect(status.configured).toBe(true)
    expect(status.slugConfigured).toBe(true)
    expect(status.oauthLoginConfigured).toBe(true)
    expect(status.webhookSecretConfigured).toBe(true)
    expect(status.requiredOk).toBe(true)
    expect(status.recommendedOk).toBe(true)
    expect(status.checks.every(check => check.ok)).toBe(true)
  })
})
