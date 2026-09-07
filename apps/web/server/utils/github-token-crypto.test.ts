import { afterEach, describe, expect, it } from 'vitest'

import { decryptSyncToken, encryptSyncToken } from './github-token-crypto'

const originalNodeEnv = process.env.NODE_ENV

describe('github-token-crypto', () => {
  afterEach(() => {
    delete process.env.GITHUB_SYNC_TOKEN_SECRET
    delete process.env.NUXT_SESSION_PASSWORD
    process.env.NODE_ENV = originalNodeEnv
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

  it('refuses the dev fallback secret in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => encryptSyncToken('ghp_test-token')).toThrow(/GITHUB_SYNC_TOKEN_SECRET/)
  })

  it('still encrypts in production when a real secret is configured', () => {
    process.env.NODE_ENV = 'production'
    process.env.GITHUB_SYNC_TOKEN_SECRET = 'test-secret'
    const encrypted = encryptSyncToken('ghp_test-token')
    expect(decryptSyncToken(encrypted)).toBe('ghp_test-token')
  })
})
