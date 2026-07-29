import { describe, expect, it } from 'vitest'

import { getAuthCallbackUrl } from './auth-callback-url'

describe('getAuthCallbackUrl', () => {
  it('uses internal redirect when provided', () => {
    expect(getAuthCallbackUrl('/accept-invitation/abc', '/')).toBe('/accept-invitation/abc')
    expect(getAuthCallbackUrl('/notes', '/')).toBe('/notes')
    expect(getAuthCallbackUrl('/settings/workspace?x=1', '/')).toBe('/settings/workspace?x=1')
  })

  it('falls back to default when redirect is not a string or not internal', () => {
    expect(getAuthCallbackUrl(undefined, '/')).toBe('/')
    expect(getAuthCallbackUrl(null, '/')).toBe('/')
    expect(getAuthCallbackUrl(123, '/')).toBe('/')
    expect(getAuthCallbackUrl('https://example.com', '/')).toBe('/')
    expect(getAuthCallbackUrl('mailto:alice@example.com', '/')).toBe('/')
    expect(getAuthCallbackUrl('//example.com', '/')).toBe('/')
  })
})
