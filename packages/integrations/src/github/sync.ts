import { fetchCollaborators, mapGitHubPermission } from './collaborators.ts'
import type { GitHubCollaborator, WorkspaceMemberPermission } from './collaborators.ts'

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
  resolveUserIdByGitHubLogin(login: string): Promise<string | null>
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

export interface SyncWorkspaceMembersResult {
  created: number
  updated: number
  deleted: number
  skippedLocalOverride: number
  skippedManual: number
  skippedUnlinked: number
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
  }

  for (const collaborator of collaborators) {
    const userId = await deps.resolveUserIdByGitHubLogin(collaborator.login)
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

    if (existingMember.role !== desiredRole) {
      await deps.updateWorkspaceMemberRole(existingMember.id, desiredRole)
      result.updated += 1
    }

    await deps.upsertMemberSyncMeta({
      memberId: existingMember.id,
      source: 'github',
      localOverride: existingMeta?.localOverride ?? false,
    })
  }

  if (deps.removeWorkspaceMember) {
    for (const member of members) {
      const memberMeta = syncMetaByMemberId.get(member.id)
      if (!memberMeta || memberMeta.source !== 'github' || memberMeta.localOverride) {
        continue
      }

      if (collaboratorUserIds.has(member.userId)) {
        continue
      }

      await deps.removeWorkspaceMember(member.id)
      result.deleted += 1
    }
  }

  return result
}
