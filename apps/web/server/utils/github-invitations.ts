import { randomUUID } from 'node:crypto'
import {
  account,
  buildGithubNoreplyEmail,
  getAuth,
  getDb,
  githubInvitation,
  invitation as betterAuthInvitation,
  member,
  user,
} from '@fluffmind/db'
import {
  normalizeGitHubLogin,
  resolveGitHubUser,
  type ResolvedGitHubUser,
} from '@fluffmind/integrations'
import { and, eq, gt, or, sql } from 'drizzle-orm'

import { buildAcceptInvitationUrl, extractInvitationIdFromInviteMemberResponse } from '../../app/utils/invitations'
import { resolveWorkspaceGitHubCredentials } from './github-credentials'

export interface CreateWorkspaceInvitationInput {
  organizationId: string
  inviterId: string
  role: 'read' | 'write' | 'owner'
  email?: string | null
  githubLogin?: string | null
  headers: Headers
}

export interface CreateWorkspaceInvitationResult {
  invitationId: string
  url: string
  kind: 'email' | 'github' | 'github_and_email'
  githubLogin: string | null
  email: string | null
}

export interface GithubInvitationIdentity {
  githubLogin: string
  githubUserId: string | null
  resolvedEmail: string | null
  betterAuthInvitationId: string | null
}

interface NormalizedWorkspaceInvitationInput {
  email: string | null
  githubLogin: string | null
  kind: CreateWorkspaceInvitationResult['kind']
}

interface InvitationMemberResult {
  id: string
  expiresAt: Date
}

interface InsertGithubInvitationInput {
  id: string
  organizationId: string
  githubLogin: string
  githubUserId: string
  resolvedEmail: string | null
  betterAuthInvitationId: string
  role: CreateWorkspaceInvitationInput['role']
  inviterId: string
  expiresAt: Date
}

export interface CreateWorkspaceInvitationDeps {
  resolveCredentials: (organizationId: string) => Promise<{ token: string } | null>
  resolveUser: (token: string, login: string) => Promise<ResolvedGitHubUser | null>
  isAlreadyMember: (
    organizationId: string,
    githubLogin: string,
    githubUserId: string,
  ) => Promise<boolean>
  findPendingInvitation: (input: {
    organizationId: string
    githubLogin: string | null
    email: string
  }) => Promise<{ invitationId: string } | null>
  inviteMember: (input: {
    headers: Headers
    body: {
      email: string
      role: CreateWorkspaceInvitationInput['role']
      organizationId: string
    }
  }) => Promise<InvitationMemberResult>
  insertGithubInvitation: (input: InsertGithubInvitationInput) => Promise<void>
  cancelInvitation: (invitationId: string) => Promise<void>
}

export function normalizeWorkspaceInvitationInput(
  emailInput?: string | null,
  githubLoginInput?: string | null,
): NormalizedWorkspaceInvitationInput {
  const email = emailInput?.trim().toLowerCase() || null
  const rawGithubLogin = githubLoginInput?.trim() || null
  const githubLogin = rawGithubLogin ? normalizeGitHubLogin(rawGithubLogin) : null

  if (rawGithubLogin && !githubLogin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid GitHub login',
      message: 'The GitHub login is invalid.',
    })
  }
  if (!email && !githubLogin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation target required',
      message: 'An email address or GitHub login is required.',
    })
  }

  return {
    email,
    githubLogin,
    kind: githubLogin ? (email ? 'github_and_email' : 'github') : 'email',
  }
}

export function chooseInvitationEmail(
  explicitEmail: string | null,
  githubUser: Pick<ResolvedGitHubUser, 'id' | 'login' | 'email'> | null,
): string {
  if (explicitEmail)
    return explicitEmail
  if (githubUser?.email)
    return githubUser.email.toLowerCase()
  if (githubUser)
    return buildGithubNoreplyEmail(githubUser)

  throw createError({
    statusCode: 400,
    statusMessage: 'Invitation email required',
    message: 'An email address is required for an email invitation.',
  })
}

export function matchesGithubInvitationIdentity(
  identity: {
    githubAccountIds: string[]
  },
  invitation: GithubInvitationIdentity,
): boolean {
  const acceptedGithubIds = new Set([
    invitation.githubLogin.trim().toLowerCase(),
    invitation.githubUserId?.trim().toLowerCase(),
  ].filter((value): value is string => Boolean(value)))

  return identity.githubAccountIds.some(accountId =>
    acceptedGithubIds.has(accountId.trim().toLowerCase()),
  )
}

async function resolveUserIdByGithubIdentity(
  githubLogin: string,
  githubUserId: string,
): Promise<string | null> {
  const db = getDb()
  const [accountMatch] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(
      eq(account.providerId, 'github'),
      or(
        sql`lower(${account.accountId}) = lower(${githubLogin})`,
        eq(account.accountId, githubUserId),
      ),
    ))
    .limit(1)
  if (accountMatch?.userId)
    return accountMatch.userId

  const [userMatch] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.name}) = lower(${githubLogin})`)
    .limit(1)

  return userMatch?.id ?? null
}

async function isExistingWorkspaceMember(
  organizationId: string,
  githubLogin: string,
  githubUserId: string,
): Promise<boolean> {
  const userId = await resolveUserIdByGithubIdentity(githubLogin, githubUserId)
  if (!userId)
    return false

  const [membership] = await getDb()
    .select({ id: member.id })
    .from(member)
    .where(and(
      eq(member.organizationId, organizationId),
      eq(member.userId, userId),
    ))
    .limit(1)

  return Boolean(membership)
}

async function findPendingWorkspaceInvitation(input: {
  organizationId: string
  githubLogin: string | null
  email: string
}): Promise<{ invitationId: string } | null> {
  const db = getDb()
  const now = new Date()

  if (input.githubLogin) {
    const [githubMatch] = await db
      .select({
        id: githubInvitation.id,
        betterAuthInvitationId: githubInvitation.betterAuthInvitationId,
      })
      .from(githubInvitation)
      .where(and(
        eq(githubInvitation.organizationId, input.organizationId),
        sql`lower(${githubInvitation.githubLogin}) = lower(${input.githubLogin})`,
        eq(githubInvitation.status, 'pending'),
        gt(githubInvitation.expiresAt, now),
      ))
      .limit(1)

    if (githubMatch) {
      return {
        invitationId: githubMatch.betterAuthInvitationId ?? githubMatch.id,
      }
    }
  }

  const [emailMatch] = await db
    .select({ id: betterAuthInvitation.id })
    .from(betterAuthInvitation)
    .where(and(
      eq(betterAuthInvitation.organizationId, input.organizationId),
      sql`lower(${betterAuthInvitation.email}) = lower(${input.email})`,
      eq(betterAuthInvitation.status, 'pending'),
      gt(betterAuthInvitation.expiresAt, now),
    ))
    .limit(1)

  return emailMatch ? { invitationId: emailMatch.id } : null
}

function getInviteMemberResult(response: unknown): InvitationMemberResult {
  const record = response as { id?: unknown, expiresAt?: unknown } | null
  const id = typeof record?.id === 'string'
    ? record.id
    : extractInvitationIdFromInviteMemberResponse(response)
  const expiresAt = record?.expiresAt instanceof Date
    ? record.expiresAt
    : typeof record?.expiresAt === 'string'
      ? new Date(record.expiresAt)
      : null

  if (!id || !expiresAt || Number.isNaN(expiresAt.getTime())) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invitation creation failed',
      message: 'Better Auth returned an invalid invitation response.',
    })
  }

  return { id, expiresAt }
}

const defaultDeps: CreateWorkspaceInvitationDeps = {
  async resolveCredentials(organizationId) {
    return resolveWorkspaceGitHubCredentials(organizationId)
  },
  resolveUser: resolveGitHubUser,
  isAlreadyMember: isExistingWorkspaceMember,
  findPendingInvitation: findPendingWorkspaceInvitation,
  async inviteMember(input) {
    const response = await getAuth().api.createInvitation(input)
    return getInviteMemberResult(response)
  },
  async insertGithubInvitation(input) {
    await getDb().insert(githubInvitation).values(input)
  },
  async cancelInvitation(invitationId) {
    await getDb()
      .update(betterAuthInvitation)
      .set({ status: 'canceled' })
      .where(and(
        eq(betterAuthInvitation.id, invitationId),
        eq(betterAuthInvitation.status, 'pending'),
      ))
  },
}

export async function createWorkspaceInvitationWithDeps(
  input: CreateWorkspaceInvitationInput,
  deps: CreateWorkspaceInvitationDeps,
): Promise<CreateWorkspaceInvitationResult> {
  const normalized = normalizeWorkspaceInvitationInput(input.email, input.githubLogin)
  let resolvedUser: ResolvedGitHubUser | null = null

  if (normalized.githubLogin) {
    const credentials = await deps.resolveCredentials(input.organizationId)
    if (!credentials) {
      throw createError({
        statusCode: 400,
        statusMessage: 'GitHub link required',
        message: 'Link this workspace to GitHub before inviting by GitHub login.',
      })
    }

    resolvedUser = await deps.resolveUser(credentials.token, normalized.githubLogin)
    if (!resolvedUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'GitHub user not found',
        message: `GitHub user @${normalized.githubLogin} was not found.`,
      })
    }

    if (await deps.isAlreadyMember(input.organizationId, normalized.githubLogin, resolvedUser.id)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Already a member',
        message: `GitHub user @${normalized.githubLogin} is already a workspace member.`,
      })
    }
  }

  const invitationEmail = chooseInvitationEmail(normalized.email, resolvedUser)
  const pending = await deps.findPendingInvitation({
    organizationId: input.organizationId,
    githubLogin: normalized.githubLogin,
    email: invitationEmail,
  })
  if (pending) {
    return {
      invitationId: pending.invitationId,
      url: buildAcceptInvitationUrl(pending.invitationId),
      kind: normalized.kind,
      githubLogin: normalized.githubLogin,
      email: invitationEmail,
    }
  }

  const created = await deps.inviteMember({
    headers: input.headers,
    body: {
      email: invitationEmail,
      role: input.role,
      organizationId: input.organizationId,
    },
  })

  if (normalized.githubLogin && resolvedUser) {
    try {
      await deps.insertGithubInvitation({
        id: randomUUID(),
        organizationId: input.organizationId,
        githubLogin: normalized.githubLogin,
        githubUserId: resolvedUser.id,
        resolvedEmail: resolvedUser.email,
        betterAuthInvitationId: created.id,
        role: input.role,
        inviterId: input.inviterId,
        expiresAt: created.expiresAt,
      })
    } catch (error) {
      await deps.cancelInvitation(created.id)
      throw error
    }
  }

  return {
    invitationId: created.id,
    url: buildAcceptInvitationUrl(created.id),
    kind: normalized.kind,
    githubLogin: normalized.githubLogin,
    email: invitationEmail,
  }
}

export async function createWorkspaceInvitation(
  input: CreateWorkspaceInvitationInput,
): Promise<CreateWorkspaceInvitationResult> {
  return createWorkspaceInvitationWithDeps(input, defaultDeps)
}

export async function userMatchesGithubInvitation(
  userId: string,
  invitation: GithubInvitationIdentity,
): Promise<boolean> {
  const githubAccounts = await getDb()
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(
      eq(account.userId, userId),
      eq(account.providerId, 'github'),
    ))

  return matchesGithubInvitationIdentity({
    githubAccountIds: githubAccounts.map(row => row.accountId),
  }, invitation)
}
