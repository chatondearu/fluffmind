import { describe, expect, it } from 'vitest'

import { syncWorkspaceMembersFromGitHub } from './sync.ts'
import type { SyncWorkspaceMembersDeps } from './sync.ts'

function createDeps(overrides: Partial<SyncWorkspaceMembersDeps> = {}): SyncWorkspaceMembersDeps & {
  removed: string[]
  upserted: Array<{ memberId: string, source: string }>
} {
  const removed: string[] = []
  const upserted: Array<{ memberId: string, source: string }> = []
  return {
    removed,
    upserted,
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
    async upsertMemberSyncMeta(meta) {
      upserted.push({ memberId: meta.memberId, source: meta.source })
    },
    async removeWorkspaceMember(memberId) {
      removed.push(memberId)
    },
    async fetchCollaborators() {
      return []
    },
    ...overrides,
  }
}

describe('syncWorkspaceMembersFromGitHub — unsafe deletion sweeps', () => {
  it('aborts all deletions when GitHub returns an empty collaborator list', async () => {
    const deps = createDeps({
      async listWorkspaceMembers() {
        return [
          { id: 'owner-a', userId: 'user-1', role: 'owner' },
          { id: 'writer', userId: 'user-3', role: 'write' },
        ]
      },
      async listMemberSyncMeta() {
        return [
          { memberId: 'owner-a', source: 'github', localOverride: false },
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

    expect(result.deleted).toBe(0)
    expect(result.deletionSweepSkipped).toBe('empty_collaborators')
    expect(deps.removed).toEqual([])
  })

  it('aborts all deletions when no collaborator resolves to a Fluffmind user', async () => {
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
      async resolveUserIdByGitHubLogin() {
        return null
      },
      async fetchCollaborators() {
        return [
          { login: 'alice', permission: 'admin', id: '1' },
          { login: 'bob', permission: 'push', id: '2' },
        ]
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.skippedUnlinked).toBe(2)
    expect(result.deleted).toBe(0)
    expect(result.deletionSweepSkipped).toBe('unresolved_collaborators')
    expect(deps.removed).toEqual([])
  })
})

describe('syncWorkspaceMembersFromGitHub — last-owner protection', () => {
  it('keeps the sole owner when a partial collaborator set would remove them', async () => {
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
        return login === 'bob' ? 'user-2' : null
      },
      async fetchCollaborators() {
        // Writer still on GitHub; owner missing from list → protect last owner.
        return [{ login: 'bob', permission: 'push', id: '2' }]
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
    expect(result.deletionSweepSkipped).toBeNull()
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
      async resolveUserIdByGitHubLogin(login) {
        return login === 'carol' ? 'user-3' : null
      },
      async fetchCollaborators() {
        // Only the writer remains on GitHub — both owners would be removed without protection.
        return [{ login: 'carol', permission: 'push' }]
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(deps.removed).toEqual([])
    expect(deps.removed.some(id => id.startsWith('owner-'))).toBe(false)
    expect(result.deleted).toBe(0)
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
        return [{ login: 'alice', permission: 'admin' }]
      },
      async resolveUserIdByGitHubLogin() {
        return 'user-1'
      },
    })

    const result = await syncWorkspaceMembersFromGitHub(
      'org-1',
      { token: 't', owner: 'acme', repo: 'vault' },
      deps,
    )

    expect(result.deleted).toBe(0)
    expect(deps.removed).toEqual([])
    expect(deps.upserted.some(row => row.source === 'github')).toBe(false)
  })
})
