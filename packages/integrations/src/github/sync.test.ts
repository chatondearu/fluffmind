import { describe, expect, it } from 'vitest'

import { syncWorkspaceMembersFromGitHub } from './sync.ts'
import type { SyncWorkspaceMembersDeps } from './sync.ts'

function createDeps(overrides: Partial<SyncWorkspaceMembersDeps> = {}): SyncWorkspaceMembersDeps & {
  removed: string[]
} {
  const removed: string[] = []
  return {
    removed,
    async listWorkspaceMembers() {
      return []
    },
    async listMemberSyncMeta() {
      return []
    },
    async resolveUserIdByGitHubLogin() {
      return null
    },
    async createWorkspaceMember(_orgId, userId, role) {
      return { id: `m-${userId}`, userId, role }
    },
    async updateWorkspaceMemberRole() {},
    async upsertMemberSyncMeta() {},
    async removeWorkspaceMember(memberId) {
      removed.push(memberId)
    },
    async fetchCollaborators() {
      return []
    },
    ...overrides,
  }
}

describe('syncWorkspaceMembersFromGitHub — last-owner protection', () => {
  it('keeps the sole owner when collaborators are empty and source=github', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [{ id: 'member-owner', userId: 'user-1', role: 'owner' }]
      },
      async listMemberSyncMeta() {
        return [{ memberId: 'member-owner', source: 'github', localOverride: false }]
      },
      async fetchCollaborators() {
        return []
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.deleted).toBe(0)
    expect(result.skippedProtected).toBe(1)
    expect(deps.removed).toEqual([])
  })

  it('keeps the sole owner when collaborators exist but login resolution fails', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [{ id: 'member-owner', userId: 'user-1', role: 'owner' }]
      },
      async listMemberSyncMeta() {
        return [{ memberId: 'member-owner', source: 'github', localOverride: false }]
      },
      async resolveUserIdByGitHubLogin() {
        return null
      },
      async fetchCollaborators() {
        return [{ login: 'alice', permission: 'admin', id: '42' }]
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.skippedUnlinked).toBe(1)
    expect(result.deleted).toBe(0)
    expect(result.skippedProtected).toBe(1)
    expect(deps.removed).toEqual([])
  })

  it('resolves collaborators by github user id when login does not match accountId', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [{ id: 'member-owner', userId: 'user-1', role: 'owner' }]
      },
      async listMemberSyncMeta() {
        return [{ memberId: 'member-owner', source: 'github', localOverride: false }]
      },
      async resolveUserIdByGitHubLogin(login, githubUserId) {
        if (githubUserId === '99')
          return 'user-1'
        if (login === 'alice')
          return null
        return null
      },
      async fetchCollaborators() {
        return [{ login: 'alice', permission: 'admin', id: '99' }]
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.skippedUnlinked).toBe(0)
    expect(result.deleted).toBe(0)
    expect(deps.removed).toEqual([])
  })

  it('still removes non-last github members who left the repo', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [
          { id: 'member-owner', userId: 'user-1', role: 'owner' },
          { id: 'member-writer', userId: 'user-2', role: 'write' },
        ]
      },
      async listMemberSyncMeta() {
        return [
          { memberId: 'member-owner', source: 'github', localOverride: false },
          { memberId: 'member-writer', source: 'github', localOverride: false },
        ]
      },
      async resolveUserIdByGitHubLogin(login) {
        return login === 'alice' ? 'user-1' : null
      },
      async fetchCollaborators() {
        return [{ login: 'alice', permission: 'admin' }]
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.deleted).toBe(1)
    expect(deps.removed).toEqual(['member-writer'])
  })

  it('keeps at least one owner when all owners would otherwise be removed', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [
          { id: 'owner-a', userId: 'user-1', role: 'owner' },
          { id: 'owner-b', userId: 'user-2', role: 'owner' },
          { id: 'writer', userId: 'user-3', role: 'write' },
        ]
      },
      async listMemberSyncMeta() {
        return [
          { memberId: 'owner-a', source: 'github', localOverride: false },
          { memberId: 'owner-b', source: 'github', localOverride: false },
          { memberId: 'writer', source: 'github', localOverride: false },
        ]
      },
      async fetchCollaborators() {
        return []
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(deps.removed).toContain('writer')
    expect(deps.removed.some(id => id.startsWith('owner-'))).toBe(false)
    expect(result.deleted).toBe(1)
    expect(result.skippedProtected).toBe(2)
  })

  it('does not delete an owner without member_sync_meta (pre-first-sync)', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [{ id: 'member-owner', userId: 'user-1', role: 'owner' }]
      },
      async listMemberSyncMeta() {
        return []
      },
      async fetchCollaborators() {
        return []
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.deleted).toBe(0)
    expect(deps.removed).toEqual([])
  })
})
