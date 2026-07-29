import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { and, count, eq, gt, isNotNull, or, sql } from 'drizzle-orm'

import { getDb } from './client'
import { buildGithubNoreplyEmail, resolveGithubAuthEmail } from './github-auth-email'
import { ac, roles } from './permissions'
import * as schema from './schema/index'
import { canCreateUser, isPublicSignupEnabled } from './signup-policy'

type GithubInvitationSignupIdentity = {
  githubLogin: string
  githubUserId: string | null
  resolvedEmail: string | null
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

export function githubInvitationMatchesSignupEmail(
  email: string,
  invitation: GithubInvitationSignupIdentity,
): boolean {
  const normalizedEmail = email.trim().toLowerCase()
  if (invitation.resolvedEmail?.trim().toLowerCase() === normalizedEmail)
    return true

  if (!invitation.githubUserId)
    return false

  return buildGithubNoreplyEmail({
    id: invitation.githubUserId,
    login: invitation.githubLogin,
  }) === normalizedEmail
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

  const resolvedEmail = invitation.resolvedEmail?.trim()
  if (resolvedEmail)
    return resolvedEmail.toLowerCase()

  return buildGithubNoreplyEmail({
    id: String(profile.id),
    login: String(profile.login),
  })
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
                      expiresAt: schema.githubInvitation.expiresAt,
                      status: schema.githubInvitation.status,
                    })
                    .from(schema.githubInvitation)
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

            if (email && !hasPendingInvitation) {
              const [githubInvite] = await db
                .select({
                  githubLogin: schema.githubInvitation.githubLogin,
                  githubUserId: schema.githubInvitation.githubUserId,
                  resolvedEmail: schema.githubInvitation.resolvedEmail,
                  expiresAt: schema.githubInvitation.expiresAt,
                  status: schema.githubInvitation.status,
                })
                .from(schema.githubInvitation)
                .where(and(
                  eq(schema.githubInvitation.status, 'pending'),
                  gt(schema.githubInvitation.expiresAt, new Date()),
                  or(
                    sql`lower(${schema.githubInvitation.resolvedEmail}) = ${email}`,
                    and(
                      isNotNull(schema.githubInvitation.githubUserId),
                      sql`lower(${schema.githubInvitation.githubUserId} || '+' || ${schema.githubInvitation.githubLogin} || '@users.noreply.github.com') = ${email}`,
                    ),
                  ),
                ))
                .limit(1)

              hasPendingInvitation = hasPendingGithubInvitationForSignup({
                email,
                invitations: githubInvite ? [githubInvite] : [],
              })
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
