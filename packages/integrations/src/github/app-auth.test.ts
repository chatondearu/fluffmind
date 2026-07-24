import { describe, expect, it, vi } from 'vitest'

import { createAppJwt, createInstallationToken } from './app-auth.ts'

describe('createInstallationToken', () => {
  it('mints a scoped installation token through the injected auth factory', async () => {
    const auth = vi.fn().mockResolvedValue({
      token: 'ghs_test',
      expiresAt: '2026-07-24T18:00:00Z',
    })
    const createAuth = vi.fn(() => auth)

    await expect(
      createInstallationToken(
        {
          appId: '123',
          privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        },
        '456',
        {
          repositoryIds: [789],
          repositories: ['acme/vault'],
        },
        createAuth,
      ),
    ).resolves.toEqual({
      token: 'ghs_test',
      expiresAt: '2026-07-24T18:00:00Z',
    })

    expect(createAuth).toHaveBeenCalledWith({
      appId: '123',
      privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    })
    expect(auth).toHaveBeenCalledWith({
      type: 'installation',
      installationId: '456',
      repositoryIds: [789],
      repositoryNames: ['acme/vault'],
    })
  })
})

describe('createAppJwt', () => {
  it('mints an App-level JWT through the injected auth factory', async () => {
    const auth = vi.fn().mockResolvedValue({
      token: 'jwt_test',
      expiresAt: '2026-07-24T18:10:00Z',
    })
    const createAuth = vi.fn(() => auth)

    await expect(
      createAppJwt(
        {
          appId: '123',
          privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        },
        createAuth,
      ),
    ).resolves.toEqual({
      token: 'jwt_test',
      expiresAt: '2026-07-24T18:10:00Z',
    })

    expect(createAuth).toHaveBeenCalledWith({
      appId: '123',
      privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    })
    expect(auth).toHaveBeenCalledWith({ type: 'app' })
  })
})
