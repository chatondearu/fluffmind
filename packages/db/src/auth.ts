import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { and, count, eq, gt, isNotNull, or, sql } from 'drizzle-orm'

import { getDb } from './client'
import { resolveGithubAuthEmail } from './github-auth-email'
import { ac, roles } from './permissions'
import * as schema from './schema/index'
import { canCreateUser, isPublicSignupEnabled } from './signup-policy'

type GithubInvitationSignupIdentity = {
  githubLogin: string
  githubUserId: string | null
  resolvedEmail: string | null
  betterAuthInvitationEmail?: string | null
}

type PendingGithubInvitationForSignup = GithubInvitationSignupIdentity & {
  expiresAt: Date
  status: string
}

type GithubSignupProfile = {
  id?: string | number | null
  login?: string | null
  email?: string | null
}

type GithubInvitationAcceptanceIdentity = {
  githubLogin?: string | null
  githubUserId?: string | null
}

export function canAcceptGithubInvitation(input: {
  invitation: GithubInvitationAcceptanceIdentity | null
  githubAccountIds: readonly string[]
}): boolean {
  const githubLogin = input.invitation?.githubLogin?.trim().toLowerCase()
  if (!githubLogin)
    return true

  const acceptedAccountIds = new Set([
    githubLogin,
    input.invitation?.githubUserId?.trim().toLowerCase(),
  ].filter((value): value is string => Boolean(value)))

  return input.githubAccountIds.some(accountId =>
    acceptedAccountIds.has(accountId.trim().toLowerCase()),
  )
}

export function githubInvitationMatchesSignupEmail(
  email: string,
  invitation: GithubInvitationSignupIdentity,
): boolean {
  const normalizedEmail = email.trim().toLowerCase()
  return invitation.resolvedEmail?.trim().toLowerCase() === normalizedEmail
}

export function hasPendingGithubInvitationForSignup(input: {
  email: string
  invitations: readonly PendingGithubInvitationForSignup[]
  now?: Date
}): boolean {
  const now = input.now ?? new Date()

  return input.invitations.some(invitation => (
    invitation.status === 'pending'
    && invitation.expiresAt > now
    && githubInvitationMatchesSignupEmail(input.email, invitation)
  ))
}

export function resolveGithubSignupEmail(
  profile: GithubSignupProfile,
  invitation?: GithubInvitationSignupIdentity,
): string {
  if (!invitation)
    return resolveGithubAuthEmail(profile)

  const invitationEmail = invitation.resolvedEmail?.trim()
    || invitation.betterAuthInvitationEmail?.trim()
  if (invitationEmail)
    return invitationEmail.toLowerCase()

  return resolveGithubAuthEmail(profile)
}

function getInvitationBaseUrl(): string {
  const configured = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || 'http://localhost:3000'
  return configured.replace(/\/+$/, '')
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required when authentication is enabled.')
  }

  return betterAuth({
    secret,
    baseURL: getInvitationBaseUrl(),
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            async mapProfileToUser(profile) {
              const db = getDb()
              const login = profile.login?.trim().toLowerCase() || ''
              const [githubInvitation] = login
                ? await db
                    .select({
                      githubLogin: schema.githubInvitation.githubLogin,
                      githubUserId: schema.githubInvitation.githubUserId,
                      resolvedEmail: schema.githubInvitation.resolvedEmail,
                      betterAuthInvitationEmail: schema.invitation.email,
                      expiresAt: schema.githubInvitation.expiresAt,
                      status: schema.githubInvitation.status,
                    })
                    .from(schema.githubInvitation)
                    .leftJoin(
                      schema.invitation,
                      eq(
                        schema.githubInvitation.betterAuthInvitationId,
                        schema.invitation.id,
                      ),
                    )
                    .where(and(
                      sql`lower(${schema.githubInvitation.githubLogin}) = ${login}`,
                      eq(schema.githubInvitation.status, 'pending'),
                      gt(schema.githubInvitation.expiresAt, new Date()),
                    ))
                    .limit(1)
                : []
              return {
                email: resolveGithubSignupEmail(profile, githubInvitation),
                name: profile.name || profile.login || undefined,
              }
            },
          },
        }
      : {},
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'owner',
          input: false,
        },
        disabledAt: {
          type: 'date',
          required: false,
          input: false,
        },
      },
    },
    plugins: [
      organization({
        ac,
        roles,
        async sendInvitationEmail(data) {
          const invitationLink = `${getInvitationBaseUrl()}/accept-invitation/${data.id}`
          // Placeholder for transactional email integration.
          console.log(
            '[auth] invitation link',
            JSON.stringify({
              invitationId: data.id,
              email: data.email,
              role: data.role,
              organizationId: data.organization.id,
              invitationLink,
            }),
          )
        },
        organizationHooks: {
          async beforeAcceptInvitation({ invitation, user, organization }) {
            const db = getDb()
            const normalizedEmail = invitation.email.trim().toLowerCase()
            const [githubInvite] = await db
              .select({
                githubLogin: schema.githubInvitation.githubLogin,
                githubUserId: schema.githubInvitation.githubUserId,
              })
              .from(schema.githubInvitation)
              .where(and(
                eq(schema.githubInvitation.status, 'pending'),
                or(
                  eq(schema.githubInvitation.betterAuthInvitationId, invitation.id),
                  and(
                    eq(schema.githubInvitation.organizationId, organization.id),
                    or(
                      sql`lower(${schema.githubInvitation.resolvedEmail}) = ${normalizedEmail}`,
                      and(
                        isNotNull(schema.githubInvitation.githubUserId),
                        sql`lower(${schema.githubInvitation.githubUserId} || '+' || ${schema.githubInvitation.githubLogin} || '@users.noreply.github.com') = ${normalizedEmail}`,
                      ),
                    ),
                  ),
                ),
              ))
              .limit(1)

            if (!githubInvite?.githubLogin)
              return

            const githubAccounts = await db
              .select({ accountId: schema.account.accountId })
              .from(schema.account)
              .where(and(
                eq(schema.account.userId, user.id),
                eq(schema.account.providerId, 'github'),
              ))

            if (!canAcceptGithubInvitation({
              invitation: githubInvite,
              githubAccountIds: githubAccounts.map(row => row.accountId),
            })) {
              throw new APIError('FORBIDDEN', {
                message: `Connect the GitHub account @${githubInvite.githubLogin} before accepting this invitation.`,
              })
            }
          },
          async afterAcceptInvitation({ invitation, member }) {
            const db = getDb()
            await db
              .insert(schema.memberSyncMeta)
              .values({
                memberId: member.id,
                source: 'manual',
              })
              .onConflictDoUpdate({
                target: schema.memberSyncMeta.memberId,
                set: {
                  source: 'manual',
                },
              })

            await db
              .update(schema.githubInvitation)
              .set({ status: 'accepted' })
              .where(and(
                eq(schema.githubInvitation.betterAuthInvitationId, invitation.id),
                eq(schema.githubInvitation.status, 'pending'),
              ))
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            const db = getDb()
            const [{ total } = { total: 0 }] = await db
              .select({ total: count() })
              .from(schema.user)

            const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : ''
            let hasPendingInvitation = false
            if (email) {
              const [invite] = await db
                .select({ id: schema.invitation.id })
                .from(schema.invitation)
                .where(and(
                  eq(schema.invitation.email, email),
                  eq(schema.invitation.status, 'pending'),
                  gt(schema.invitation.expiresAt, new Date()),
                ))
                .limit(1)
              hasPendingInvitation = Boolean(invite)
            }

            const allowed = canCreateUser({
              publicSignupEnabled: isPublicSignupEnabled(),
              existingUserCount: Number(total),
              hasPendingInvitation,
            })

            if (!allowed) {
              throw new APIError('FORBIDDEN', {
                message: 'Public signup is disabled. Use an invitation link.',
              })
            }
          },
          async after(user) {
            const [{ total } = { total: 0 }] = await getDb()
              .select({ total: count() })
              .from(schema.user)

            if (Number(total) !== 1)
              return

            await getDb()
              .update(schema.user)
              .set({ role: 'admin' })
              .where(eq(schema.user.id, user.id))
          },
        },
      },
      session: {
        create: {
          async before(session) {
            if (!session.userId)
              return

            const [user] = await getDb()
              .select({ disabledAt: schema.user.disabledAt })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1)

            if (user?.disabledAt)
              return false
          },
        },
      },
    },
  })
}

let authInstance: ReturnType<typeof createAuth> | null = null

/** Lazily initializes Better Auth so solo mode (`AUTH_DISABLED=true`) never loads it. */
export function getAuth() {
  if (!authInstance)
    authInstance = createAuth()
  return authInstance
}
