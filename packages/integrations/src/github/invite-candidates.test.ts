import { describe, expect, it, vi } from 'vitest'

import { listGitHubInviteCandidates } from './invite-candidates.ts'

describe('listGitHubInviteCandidates', () => {
  it('prefers org members for Organization installs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/orgs/acme/members'))
        return { ok: true, json: async () => [{ id: 1, login: 'alice', avatar_url: null }] }
      throw new Error(`unexpected ${url}`)
    }))

    const result = await listGitHubInviteCandidates({
      token: 't',
      installationAccountLogin: 'acme',
      installationAccountType: 'Organization',
      repoOwner: 'acme',
      repoName: 'vault',
    })

    expect(result).toEqual([{ login: 'alice', id: '1', avatarUrl: null, source: 'org_member' }])
  })

  it('falls back to collaborators when not an org install', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/alice/vault/collaborators'))
        return { ok: true, json: async () => [{ login: 'bob', permissions: { pull: true } }] }
      throw new Error(`unexpected ${url}`)
    }))

    const result = await listGitHubInviteCandidates({
      token: 't',
      installationAccountLogin: 'alice',
      installationAccountType: 'User',
      repoOwner: 'alice',
      repoName: 'vault',
    })

    expect(result[0]?.login).toBe('bob')
    expect(result[0]?.source).toBe('collaborator')
  })
})
