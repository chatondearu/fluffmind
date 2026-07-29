import { describe, expect, it } from 'vitest'

import { canCreateUser, isPublicSignupEnabled } from '@fluffmind/db'

describe('signup-policy (server)', () => {
  it('treats AUTH_PUBLIC_SIGNUP=true as open signup', () => {
    expect(isPublicSignupEnabled('true')).toBe(true)
    expect(isPublicSignupEnabled('false')).toBe(false)
    expect(isPublicSignupEnabled(undefined)).toBe(false)
  })

  it('always allows the first user (bootstrap)', () => {
    expect(canCreateUser({
      publicSignupEnabled: false,
      existingUserCount: 0,
      hasPendingInvitation: false,
    })).toBe(true)
  })

  it('allows signup when public signup is enabled', () => {
    expect(canCreateUser({
      publicSignupEnabled: true,
      existingUserCount: 3,
      hasPendingInvitation: false,
    })).toBe(true)
  })

  it('allows invite-only signup only with a pending invitation', () => {
    expect(canCreateUser({
      publicSignupEnabled: false,
      existingUserCount: 1,
      hasPendingInvitation: true,
    })).toBe(true)

    expect(canCreateUser({
      publicSignupEnabled: false,
      existingUserCount: 1,
      hasPendingInvitation: false,
    })).toBe(false)
  })
})
