import { afterEach, describe, expect, it } from 'vitest'

import { decryptSyncToken, encryptSyncToken } from './github-token-crypto'

describe('github-token-crypto', () => {
  afterEach(() => {
    delete process.env.GITHUB_SYNC_TOKEN_SECRET
    delete process.env.NUXT_SESSION_PASSWORD
  })

  it('round-trips tokens using the configured secret', () => {
    process.env.GITHUB_SYNC_TOKEN_SECRET = 'test-secret'

    const encrypted = encryptSyncToken('ghp_test-token')

    expect(encrypted).toMatch(/^enc:v1:[^.]+\.[^.]+\.[^.]+$/)
    expect(decryptSyncToken(encrypted)).toBe('ghp_test-token')
  })

  it('returns legacy unencrypted tokens unchanged', () => {
    expect(decryptSyncToken('ghp_legacy-token')).toBe('ghp_legacy-token')
  })
})
