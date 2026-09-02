import { fetchCollaborators, mapGitHubPermission } from './collaborators'
import type { GitHubCollaborator, WorkspaceMemberPermission } from './collaborators'

export type MemberSyncSource = 'github' | 'manual'

export interface WorkspaceMember {
  id: string
  userId: string
  role: WorkspaceMemberPermission
}

export interface MemberSyncMeta {
  memberId: string
  source: MemberSyncSource
  localOverride: boolean
}

export interface SyncWorkspaceMembersOptions {
  token: string
  owner: string
  repo: string
}

export interface SyncWorkspaceMembersDeps {
  listWorkspaceMembers(orgId: string): Promise<WorkspaceMember[]>
  listMemberSyncMeta(orgId: string): Promise<MemberSyncMeta[]>
  /**
   * Resolve a Fluffmind user from a GitHub collaborator.
   * Prefer matching `githubUserId` (Better Auth accountId) then login.
   */
  resolveUserIdByGitHubLogin(login: string, githubUserId?: string | null): Promise<string | null>
  createWorkspaceMember(orgId: string, userId: string, role: WorkspaceMemberPermission): Promise<WorkspaceMember>
  updateWorkspaceMemberRole(memberId: string, role: WorkspaceMemberPermission): Promise<void>
  upsertMemberSyncMeta(meta: MemberSyncMeta): Promise<void>
  removeWorkspaceMember?(memberId: string): Promise<void>
  fetchCollaborators?(
    token: string,
    owner: string,
    repo: string
  ): Promise<GitHubCollaborator[]>
}

export type DeletionSweepSkipReason = 'empty_collaborators' | 'unresolved_collaborators'

export interface SyncWorkspaceMembersResult {
  created: number
  updated: number
  deleted: number
  skippedLocalOverride: number
  skippedManual: number
  skippedUnlinked: number
  /** Members that would have been removed but were kept to preserve last owner/member. */
  skippedProtected: number
  /**
   * When set, no member deletions ran because the collaborator signal is unsafe
   * (empty list or zero resolved Fluffmind users).
   */
  deletionSweepSkipped: DeletionSweepSkipReason | null
}

/**
 * Members marked for removal that must stay so the workspace remains usable:
 * - never leave the org with zero members
 * - never leave the org with zero owners when at least one owner existed
 */
export function selectProtectedRemovals(
  members: WorkspaceMember[],
  removalCandidateIds: Set<string>,
): Set<string> {
  const protectedIds = new Set<string>()
  if (removalCandidateIds.size === 0)
    return protectedIds

  const remaining = () => members.filter(member =>
    !removalCandidateIds.has(member.id) || protectedIds.has(member.id),
  )

  // If every owner is a removal candidate, keep all of them.
  if (remaining().filter(m => m.role === 'owner').length === 0) {
    for (const member of members) {
      if (member.role === 'owner' && removalCandidateIds.has(member.id))
        protectedIds.add(member.id)
    }
  }

  // Never leave the organization with zero members.
  if (remaining().length === 0) {
    const preferOwner = members.find(m => removalCandidateIds.has(m.id) && m.role === 'owner')
      ?? members.find(m => removalCandidateIds.has(m.id))
    if (preferOwner)
      protectedIds.add(preferOwner.id)
  }

  return protectedIds
}

export async function syncWorkspaceMembersFromGitHub(
  orgId: string,
  options: SyncWorkspaceMembersOptions,
  deps: SyncWorkspaceMembersDeps
): Promise<SyncWorkspaceMembersResult> {
  const collaboratorsFetcher = deps.fetchCollaborators ?? fetchCollaborators
  const collaborators = await collaboratorsFetcher(options.token, options.owner, options.repo)

  const [members, syncMeta] = await Promise.all([
    deps.listWorkspaceMembers(orgId),
    deps.listMemberSyncMeta(orgId),
  ])

  const membersByUserId = new Map(members.map(member => [member.userId, member]))
  const syncMetaByMemberId = new Map(syncMeta.map(meta => [meta.memberId, meta]))

  const collaboratorUserIds = new Set<string>()
  const result: SyncWorkspaceMembersResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skippedLocalOverride: 0,
    skippedManual: 0,
    skippedUnlinked: 0,
    skippedProtected: 0,
    deletionSweepSkipped: null,
  }

  for (const collaborator of collaborators) {
    const userId = await deps.resolveUserIdByGitHubLogin(collaborator.login, collaborator.id)
    if (!userId) {
      result.skippedUnlinked += 1
      continue
    }

    collaboratorUserIds.add(userId)
    const desiredRole = mapGitHubPermission(collaborator.permission)
    const existingMember = membersByUserId.get(userId)

    if (!existingMember) {
      const createdMember = await deps.createWorkspaceMember(orgId, userId, desiredRole)
      await deps.upsertMemberSyncMeta({
        memberId: createdMember.id,
        source: 'github',
        localOverride: false,
      })

      membersByUserId.set(userId, createdMember)
      syncMetaByMemberId.set(createdMember.id, {
        memberId: createdMember.id,
        source: 'github',
        localOverride: false,
      })
      result.created += 1
      continue
    }

    const existingMeta = syncMetaByMemberId.get(existingMember.id)

    if (existingMeta?.source === 'manual') {
      result.skippedManual += 1
      continue
    }

    if (existingMeta?.localOverride) {
      result.skippedLocalOverride += 1
      continue
    }

    // Pre-existing members without sync meta (workspace creators / bootstrap) must not
    // be tagged source=github — that made them eligible for deletion on later sweeps.
    if (!existingMeta) {
      if (existingMember.role !== desiredRole) {
        await deps.updateWorkspaceMemberRole(existingMember.id, desiredRole)
        result.updated += 1
      }
      continue
    }

    if (existingMember.role !== desiredRole) {
      await deps.updateWorkspaceMemberRole(existingMember.id, desiredRole)
      result.updated += 1
    }

    await deps.upsertMemberSyncMeta({
      memberId: existingMember.id,
      source: 'github',
      localOverride: existingMeta.localOverride,
    })
  }

  if (deps.removeWorkspaceMember) {
    if (collaborators.length === 0) {
      result.deletionSweepSkipped = 'empty_collaborators'
      return result
    }

    if (collaboratorUserIds.size === 0) {
      result.deletionSweepSkipped = 'unresolved_collaborators'
      return result
    }

    const removalCandidateIds = new Set<string>()
    for (const member of members) {
      const memberMeta = syncMetaByMemberId.get(member.id)
      if (!memberMeta || memberMeta.source !== 'github' || memberMeta.localOverride)
        continue
      if (collaboratorUserIds.has(member.userId))
        continue
      removalCandidateIds.add(member.id)
    }

    const protectedIds = selectProtectedRemovals(members, removalCandidateIds)
    result.skippedProtected = protectedIds.size

    for (const memberId of removalCandidateIds) {
      if (protectedIds.has(memberId))
        continue
      await deps.removeWorkspaceMember(memberId)
      result.deleted += 1
    }
  }

  return result
}
