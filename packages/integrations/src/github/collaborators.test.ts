import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchCollaborators, mapGitHubPermission } from './collaborators.ts'

describe('mapGitHubPermission', () => {
  it('maps pull to read', () => {
    expect(mapGitHubPermission('pull')).toBe('read')
  })

  it('maps push to write', () => {
    expect(mapGitHubPermission('push')).toBe('write')
  })

  it('maps maintain to write', () => {
    expect(mapGitHubPermission('maintain')).toBe('write')
  })

  it('maps admin to owner', () => {
    expect(mapGitHubPermission('admin')).toBe('owner')
  })

  it('maps GitHub UI role names (read/write) rather than throwing', () => {
    expect(mapGitHubPermission('read')).toBe('read')
    expect(mapGitHubPermission('write')).toBe('write')
  })

  it('fails closed to read for an unknown/custom role', () => {
    expect(mapGitHubPermission('custom-role')).toBe('read')
  })
})

describe('fetchCollaborators permission resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubCollaborators(collaborators: unknown[]) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => collaborators,
    })))
  }

  it('resolves a "write" role_name via the permissions booleans (regression)', async () => {
    // GitHub returns role_name in UI vocabulary ("write"), which is not an API
    // permission name — previously this threw `Unsupported GitHub permission "write"`.
    stubCollaborators([
      { login: 'octocat', role_name: 'write', permissions: { pull: true, triage: true, push: true } },
    ])

    const [collaborator] = await fetchCollaborators('token', 'owner', 'repo')
    expect(collaborator!.permission).toBe('push')
    expect(mapGitHubPermission(collaborator!.permission)).toBe('write')
  })

  it('resolves admin from the permissions booleans', async () => {
    stubCollaborators([
      { login: 'admin-user', role_name: 'admin', permissions: { pull: true, push: true, maintain: true, admin: true } },
    ])

    const [collaborator] = await fetchCollaborators('token', 'owner', 'repo')
    expect(mapGitHubPermission(collaborator!.permission)).toBe('owner')
  })

  it('falls back to a normalized role_name when permissions are absent', async () => {
    stubCollaborators([{ login: 'legacy', role_name: 'read' }])

    const [collaborator] = await fetchCollaborators('token', 'owner', 'repo')
    expect(collaborator!.permission).toBe('pull')
    expect(mapGitHubPermission(collaborator!.permission)).toBe('read')
  })
})
