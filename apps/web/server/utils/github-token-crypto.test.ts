import { afterEach, describe, expect, it } from 'vitest'

import { decryptSyncToken, encryptSyncToken } from './github-token-crypto'

const originalNodeEnv = process.env.NODE_ENV
const originalAuthDisabled = process.env.AUTH_DISABLED
const originalDatabaseUrl = process.env.DATABASE_URL

describe('github-token-crypto', () => {
  afterEach(() => {
    delete process.env.GITHUB_SYNC_TOKEN_SECRET
    delete process.env.NUXT_SESSION_PASSWORD
    process.env.NODE_ENV = originalNodeEnv
    if (originalAuthDisabled === undefined)
      delete process.env.AUTH_DISABLED
    else
      process.env.AUTH_DISABLED = originalAuthDisabled
    if (originalDatabaseUrl === undefined)
      delete process.env.DATABASE_URL
    else
      process.env.DATABASE_URL = originalDatabaseUrl
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
    process.env.AUTH_DISABLED = 'true'
    delete process.env.DATABASE_URL
    expect(() => encryptSyncToken('ghp_test-token')).toThrow(/GITHUB_SYNC_TOKEN_SECRET/)
  })

  it('refuses the dev fallback secret when auth is effectively on', () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'
    expect(() => encryptSyncToken('ghp_test-token')).toThrow(/GITHUB_SYNC_TOKEN_SECRET/)
  })

  it('allows the dev fallback when auth is off outside production', () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_DISABLED = 'true'
    process.env.DATABASE_URL = 'postgres://x'
    const encrypted = encryptSyncToken('ghp_test-token')
    expect(decryptSyncToken(encrypted)).toBe('ghp_test-token')
  })

  it('still encrypts in production when a real secret is configured', () => {
    process.env.NODE_ENV = 'production'
    process.env.GITHUB_SYNC_TOKEN_SECRET = 'test-secret'
    const encrypted = encryptSyncToken('ghp_test-token')
    expect(decryptSyncToken(encrypted)).toBe('ghp_test-token')
  })

  it('still encrypts when auth is on and a real secret is configured', () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.GITHUB_SYNC_TOKEN_SECRET = 'test-secret'
    const encrypted = encryptSyncToken('ghp_test-token')
    expect(decryptSyncToken(encrypted)).toBe('ghp_test-token')
  })
})
