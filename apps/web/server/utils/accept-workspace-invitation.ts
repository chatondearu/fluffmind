import {
  getAuth,
  getDb,
  githubInvitation,
  invitation as betterAuthInvitation,
  member,
  memberSyncMeta,
} from '@fluffmind/db'
import { randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'

import { userMatchesGithubInvitation } from './github-invitations'

type BetterAuthInvitation = {
  id: string
  email: string
  status: string
  expiresAt: Date
}

type GithubInvitation = {
  id: string
  organizationId: string
  githubLogin: string
  githubUserId: string | null
  resolvedEmail: string | null
  betterAuthInvitationId: string | null
  role: string
  status: string
  expiresAt: Date
}

type AcceptWorkspaceInvitationInput = {
  id: string
  userId: string
  userEmail: string
  headers: Headers
  now?: Date
}

type AcceptWorkspaceInvitationDeps = {
  findBetterAuthInvitation: (id: string) => Promise<BetterAuthInvitation | null>
  findGithubInvitationByBetterAuthId: (id: string) => Promise<GithubInvitation | null>
  findGithubInvitationById: (id: string) => Promise<GithubInvitation | null>
  userMatchesGithubInvitation: (
    userId: string,
    invitation: GithubInvitation,
  ) => Promise<boolean>
  alignBetterAuthInvitationEmail: (id: string, email: string) => Promise<void>
  acceptBetterAuthInvitation: (id: string, headers: Headers) => Promise<void>
  markGithubInvitationAccepted: (id: string) => Promise<void>
  acceptGithubOnlyInvitation: (
    invitation: GithubInvitation,
    userId: string,
  ) => Promise<void>
}

function forbiddenGithubAccount(login: string): never {
  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden',
    message: `Connecte-toi avec le compte GitHub @${login}.`,
  })
}

function invitationUnavailable(): never {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not found',
    message: 'Cette invitation est introuvable, expirée ou déjà utilisée.',
  })
}

export async function acceptWorkspaceInvitationWithDeps(
  input: AcceptWorkspaceInvitationInput,
  deps: AcceptWorkspaceInvitationDeps,
): Promise<{ ok: true }> {
  const now = input.now ?? new Date()
  const betterAuth = await deps.findBetterAuthInvitation(input.id)

  if (betterAuth?.status === 'pending' && betterAuth.expiresAt > now) {
    const linkedGithub = await deps.findGithubInvitationByBetterAuthId(betterAuth.id)
    const emailMatches = betterAuth.email.trim().toLowerCase()
      === input.userEmail.trim().toLowerCase()
    const githubMatches = linkedGithub
      ? await deps.userMatchesGithubInvitation(input.userId, linkedGithub)
      : false

    if (!emailMatches && !githubMatches) {
      if (linkedGithub)
        forbiddenGithubAccount(linkedGithub.githubLogin)
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'Connecte-toi avec l’adresse e-mail invitée.',
      })
    }

    if (!emailMatches && githubMatches) {
      await deps.alignBetterAuthInvitationEmail(
        betterAuth.id,
        input.userEmail.trim().toLowerCase(),
      )
    }

    await deps.acceptBetterAuthInvitation(betterAuth.id, input.headers)
    if (linkedGithub)
      await deps.markGithubInvitationAccepted(linkedGithub.id)
    return { ok: true }
  }

  const githubOnly = await deps.findGithubInvitationById(input.id)
  if (
    !githubOnly
    || githubOnly.status !== 'pending'
    || githubOnly.expiresAt <= now
  ) {
    invitationUnavailable()
  }

  if (!await deps.userMatchesGithubInvitation(input.userId, githubOnly))
    forbiddenGithubAccount(githubOnly.githubLogin)

  await deps.acceptGithubOnlyInvitation(githubOnly, input.userId)
  return { ok: true }
}

const defaultDeps: AcceptWorkspaceInvitationDeps = {
  async findBetterAuthInvitation(id) {
    const [row] = await getDb()
      .select({
        id: betterAuthInvitation.id,
        email: betterAuthInvitation.email,
        status: betterAuthInvitation.status,
        expiresAt: betterAuthInvitation.expiresAt,
      })
      .from(betterAuthInvitation)
      .where(eq(betterAuthInvitation.id, id))
      .limit(1)
    return row ?? null
  },
  async findGithubInvitationByBetterAuthId(id) {
    const [row] = await getDb()
      .select()
      .from(githubInvitation)
      .where(eq(githubInvitation.betterAuthInvitationId, id))
      .limit(1)
    return row ?? null
  },
  async findGithubInvitationById(id) {
    const [row] = await getDb()
      .select()
      .from(githubInvitation)
      .where(eq(githubInvitation.id, id))
      .limit(1)
    return row ?? null
  },
  userMatchesGithubInvitation,
  async alignBetterAuthInvitationEmail(id, email) {
    await getDb()
      .update(betterAuthInvitation)
      .set({ email })
      .where(and(
        eq(betterAuthInvitation.id, id),
        eq(betterAuthInvitation.status, 'pending'),
      ))
  },
  async acceptBetterAuthInvitation(id, headers) {
    await getAuth().api.acceptInvitation({
      headers,
      body: { invitationId: id },
    })
  },
  async markGithubInvitationAccepted(id) {
    await getDb()
      .update(githubInvitation)
      .set({ status: 'accepted' })
      .where(and(
        eq(githubInvitation.id, id),
        eq(githubInvitation.status, 'pending'),
      ))
  },
  async acceptGithubOnlyInvitation(invitation, userId) {
    await getDb().transaction(async (tx) => {
      const [claimed] = await tx
        .update(githubInvitation)
        .set({ status: 'accepted' })
        .where(and(
          eq(githubInvitation.id, invitation.id),
          eq(githubInvitation.status, 'pending'),
          gt(githubInvitation.expiresAt, new Date()),
        ))
        .returning({ id: githubInvitation.id })

      if (!claimed)
        invitationUnavailable()

      const [existingMember] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(
          eq(member.organizationId, invitation.organizationId),
          eq(member.userId, userId),
        ))
        .limit(1)

      const memberId = existingMember?.id ?? randomUUID()
      if (!existingMember) {
        await tx.insert(member).values({
          id: memberId,
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          createdAt: new Date(),
        })
      }

      await tx
        .insert(memberSyncMeta)
        .values({
          memberId,
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: memberSyncMeta.memberId,
          set: { source: 'manual' },
        })
    })
  },
}

export async function acceptWorkspaceInvitation(
  input: AcceptWorkspaceInvitationInput,
): Promise<{ ok: true }> {
  return acceptWorkspaceInvitationWithDeps(input, defaultDeps)
}
