import { describe, expect, it } from 'vitest'

import { resolveGithubAuthEmail } from '@fluffmind/db'

describe('resolveGithubAuthEmail', () => {
  it('prefers the profile email when present', () => {
    expect(resolveGithubAuthEmail({
      id: 1,
      login: 'octocat',
      email: 'Octo@Example.com',
    })).toBe('octo@example.com')
  })

  it('builds GitHub noreply from id+login when email is missing', () => {
    expect(resolveGithubAuthEmail({
      id: 42,
      login: 'octocat',
      email: null,
    })).toBe('42+octocat@users.noreply.github.com')
  })

  it('falls back to login-only or id-only noreply', () => {
    expect(resolveGithubAuthEmail({ login: 'octocat', email: '' })).toBe(
      'octocat@users.noreply.github.com',
    )
    expect(resolveGithubAuthEmail({ id: '99', email: null })).toBe(
      '99@users.noreply.github.com',
    )
  })

  it('throws when nothing usable is available', () => {
    expect(() => resolveGithubAuthEmail({ email: null })).toThrow(/missing/i)
  })
})
