import { describe, expect, it, vi } from 'vitest'

import { normalizeGitHubLogin, resolveGitHubUser } from './users.ts'

describe('normalizeGitHubLogin', () => {
  it('strips @ and lowercases', () => {
    expect(normalizeGitHubLogin('@OctoCat')).toBe('octocat')
    expect(normalizeGitHubLogin('  octocat  ')).toBe('octocat')
    expect(normalizeGitHubLogin('')).toBeNull()
    expect(normalizeGitHubLogin('bad login')).toBeNull()
  })
})

describe('resolveGitHubUser', () => {
  it('maps GitHub user payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 42, login: 'octocat', avatar_url: 'https://a', email: 'a@b.com' }),
    }))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(resolveGitHubUser('token', 'octocat')).resolves.toEqual({
      id: '42',
      login: 'octocat',
      avatarUrl: 'https://a',
      email: 'a@b.com',
    })
  })

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    await expect(resolveGitHubUser('token', 'missing')).resolves.toBeNull()
  })
})
