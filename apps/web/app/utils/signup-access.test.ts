import { describe, expect, it } from 'vitest'

import { canAccessSignup, getInternalRedirectPath, getInvitationRedirectPath } from './signup-access'

describe('signup-access', () => {
  it('parses only internal redirect paths', () => {
    expect(getInternalRedirectPath('/foo')).toBe('/foo')
    expect(getInternalRedirectPath('https://example.com')).toBeNull()
    expect(getInternalRedirectPath(null)).toBeNull()
    expect(getInternalRedirectPath(undefined)).toBeNull()
    expect(getInternalRedirectPath(123)).toBeNull()
  })

  it('detects invitation redirect paths', () => {
    expect(getInvitationRedirectPath('/accept-invitation/abc')).toBe('/accept-invitation/abc')
    expect(getInvitationRedirectPath('/accept-invitation')).toBeNull()
    expect(getInvitationRedirectPath('/accept-invitation/abc?x=1')).toBe('/accept-invitation/abc?x=1')
    expect(getInvitationRedirectPath('/other')).toBeNull()
  })

  it('allows signup when public signup is enabled', () => {
    expect(canAccessSignup({ authPublicSignupEnabled: true, redirectQuery: null })).toBe(true)
    expect(canAccessSignup({ authPublicSignupEnabled: true, redirectQuery: 'https://evil.com' })).toBe(true)
  })

  it('allows signup in invite-only mode only from invitation redirect context', () => {
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: '/accept-invitation/abc' })).toBe(true)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: '/accept-invitation' })).toBe(false)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: '/notes' })).toBe(false)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: 'https://example.com' })).toBe(false)
    expect(canAccessSignup({ authPublicSignupEnabled: false, redirectQuery: null })).toBe(false)
  })
})
