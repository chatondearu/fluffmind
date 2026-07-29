import { randomUUID } from 'node:crypto'
import {
  account,
  getDb,
  member,
  memberSyncMeta,
  user,
  workspaceConfig,
  workspaceGithubLink,
} from '@fluffmind/db'
import {
  syncWorkspaceMembersFromGitHub,
  type MemberSyncMeta,
  type SyncWorkspaceMembersDeps,
  type WorkspaceMemberPermission,
} from '@fluffmind/integrations'
import { and, eq, sql } from 'drizzle-orm'

import { isGitHubAppConfigured, resolveWorkspaceGitHubCredentials } from './github-credentials'

export interface LocalOverrideInput {
  memberId: string
  localOverride: boolean
}

export interface GitHubSyncState {
  linked: boolean
  /** Exclusive sync mode for the workspace. */
  syncMode: 'app' | 'pat' | 'local'
  owner: string | null
  repo: string | null
  authMode: 'app' | 'pat' | null
  appConfigured: boolean
  lastSyncedAt: string | null
  localOverrides: Record<string, boolean>
}

export interface SyncWorkspaceMembersForOrganizationResult extends GitHubSyncState {
  result: {
    created: number
    updated: number
    deleted: number
    skippedLocalOverride: number
    skippedManual: number
    skippedUnlinked: number
  }
}


export function parseRepoIdentifier(input: string): { owner: string, repo: string } | null {
  const match = input.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (!match)
    return null
  const [, owner, repo] = match
  if (!owner || !repo)
    return null

  return {
    owner,
    repo,
  }
}

async function getLocalOverrides(organizationId: string): Promise<Record<string, boolean>> {
  const db = getDb()
  const rows = await db
    .select({
      memberId: member.id,
      localOverride: memberSyncMeta.localOverride,
    })
    .from(member)
    .leftJoin(memberSyncMeta, eq(memberSyncMeta.memberId, member.id))
    .where(eq(member.organizationId, organizationId))

  const localOverrides: Record<string, boolean> = {}
  for (const row of rows)
    localOverrides[row.memberId] = row.localOverride ?? false
  return localOverrides
}

async function getMemberSyncMetaForOrganization(organizationId: string): Promise<MemberSyncMeta[]> {
  const db = getDb()
  const rows = await db
    .select({
      memberId: memberSyncMeta.memberId,
      source: memberSyncMeta.source,
      localOverride: memberSyncMeta.localOverride,
    })
    .from(memberSyncMeta)
    .innerJoin(member, eq(member.id, memberSyncMeta.memberId))
    .where(eq(member.organizationId, organizationId))

  return rows
}

async function applyLocalOverrides(organizationId: string, overrides: LocalOverrideInput[]): Promise<void> {
  if (overrides.length === 0)
    return

  const db = getDb()
  const members = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, organizationId))
  const workspaceMemberIds = new Set(members.map(item => item.id))
  const existingMetaByMemberId = new Map((await getMemberSyncMetaForOrganization(organizationId)).map(meta => [meta.memberId, meta]))

  for (const override of overrides) {
    if (!workspaceMemberIds.has(override.memberId))
      continue

    await db
      .insert(memberSyncMeta)
      .values({
        memberId: override.memberId,
        source: existingMetaByMemberId.get(override.memberId)?.source ?? 'github',
        localOverride: override.localOverride,
      })
      .onConflictDoUpdate({
        target: memberSyncMeta.memberId,
        set: {
          localOverride: override.localOverride,
        },
      })
  }
}

function buildSyncDeps(): SyncWorkspaceMembersDeps {
  const db = getDb()

  const normalizeMemberRole = (role: string): WorkspaceMemberPermission => {
    switch (role) {
      case 'read':
      case 'write':
      case 'owner':
        return role
      default:
        return 'read'
    }
  }

  return {
    async listWorkspaceMembers(organizationId: string) {
      const rows = await db
        .select({
          id: member.id,
          userId: member.userId,
          role: member.role,
        })
        .from(member)
        .where(eq(member.organizationId, organizationId))

      return rows.map(item => ({
        id: item.id,
        userId: item.userId,
        role: normalizeMemberRole(item.role),
      }))
    },
    async listMemberSyncMeta(organizationId: string) {
      return getMemberSyncMetaForOrganization(organizationId)
    },
    async resolveUserIdByGitHubLogin(login: string) {
      const [accountMatch] = await db
        .select({ userId: account.userId })
        .from(account)
        .where(and(eq(account.providerId, 'github'), sql`lower(${account.accountId}) = lower(${login})`))
        .limit(1)
      if (accountMatch?.userId)
        return accountMatch.userId

      const [userMatch] = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.name}) = lower(${login})`)
        .limit(1)

      return userMatch?.id ?? null
    },
    async createWorkspaceMember(organizationId: string, userId: string, role) {
      const createdAt = new Date()
      const id = randomUUID()
      await db.insert(member).values({
        id,
        organizationId,
        userId,
        role,
        createdAt,
      })

      return { id, userId, role }
    },
    async updateWorkspaceMemberRole(memberId: string, role) {
      await db.update(member).set({ role }).where(eq(member.id, memberId))
    },
    async upsertMemberSyncMeta(meta: MemberSyncMeta) {
      await db
        .insert(memberSyncMeta)
        .values(meta)
        .onConflictDoUpdate({
          target: memberSyncMeta.memberId,
          set: {
            source: meta.source,
            localOverride: meta.localOverride,
          },
        })
    },
    async removeWorkspaceMember(memberId: string) {
      await db.delete(memberSyncMeta).where(eq(memberSyncMeta.memberId, memberId))
      await db.delete(member).where(eq(member.id, memberId))
    },
  }
}

export async function getWorkspaceGitHubSyncState(organizationId: string): Promise<GitHubSyncState> {
  const db = getDb()
  const [link] = await db
    .select({
      owner: workspaceGithubLink.owner,
      repo: workspaceGithubLink.repo,
      authMode: workspaceGithubLink.authMode,
      lastSyncedAt: workspaceGithubLink.lastSyncedAt,
    })
    .from(workspaceGithubLink)
    .where(eq(workspaceGithubLink.organizationId, organizationId))
    .limit(1)

  const syncMode = link?.authMode === 'app' || link?.authMode === 'pat' ? link.authMode : 'local'

  return {
    linked: syncMode !== 'local',
    syncMode,
    owner: link?.owner ?? null,
    repo: link?.repo ?? null,
    authMode: link?.authMode ?? null,
    appConfigured: isGitHubAppConfigured(),
    lastSyncedAt: link?.lastSyncedAt ? link.lastSyncedAt.toISOString() : null,
    localOverrides: await getLocalOverrides(organizationId),
  }
}

/** Throws HTTP 409 when the workspace already has an active GitHub sync link. */
export async function assertWorkspaceGithubLinkAbsent(organizationId: string): Promise<void> {
  const db = getDb()
  const [existingLink] = await db
    .select({ organizationId: workspaceGithubLink.organizationId })
    .from(workspaceGithubLink)
    .where(eq(workspaceGithubLink.organizationId, organizationId))
    .limit(1)

  if (!existingLink)
    return

  throw createError({
    statusCode: 409,
    statusMessage: 'Sync already active',
    message: 'A sync mode is already active for this workspace. Unlink it before choosing another.',
  })
}

/** Removes GitHub link and clears git remote → syncMode local. */
export async function unlinkWorkspaceGithubSync(organizationId: string): Promise<GitHubSyncState> {
  const db = getDb()
  await db.delete(workspaceGithubLink).where(eq(workspaceGithubLink.organizationId, organizationId))
  await db
    .update(workspaceConfig)
    .set({ gitRemoteUrl: null })
    .where(eq(workspaceConfig.organizationId, organizationId))

  return getWorkspaceGitHubSyncState(organizationId)
}

export async function syncWorkspaceMembersForOrganization(
  organizationId: string,
  overrides: LocalOverrideInput[] = [],
): Promise<SyncWorkspaceMembersForOrganizationResult> {
  const db = getDb()
  const credentials = await resolveWorkspaceGitHubCredentials(organizationId)
  if (!credentials)
    throw new Error('Workspace is not linked to a GitHub repository.')

  await applyLocalOverrides(organizationId, overrides)

  const result = await syncWorkspaceMembersFromGitHub(
    organizationId,
    {
      token: credentials.token,
      owner: credentials.owner,
      repo: credentials.repo,
    },
    buildSyncDeps(),
  )

  const now = new Date()
  await db
    .update(workspaceGithubLink)
    .set({ lastSyncedAt: now })
    .where(eq(workspaceGithubLink.organizationId, organizationId))

  const state = await getWorkspaceGitHubSyncState(organizationId)
  return {
    ...state,
    result,
  }
}
