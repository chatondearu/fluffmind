import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { count, eq } from 'drizzle-orm'

import { getDb } from './client'
import { ac, roles } from './permissions'
import * as schema from './schema/index'

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
          async afterAcceptInvitation({ member }) {
            await getDb()
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
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
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
