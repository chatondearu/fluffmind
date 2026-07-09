import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { count, eq } from 'drizzle-orm'

import { db } from './client.ts'
import { ac, roles } from './permissions.ts'
import * as schema from './schema/index.ts'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
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
        // Placeholder for transactional email integration.
        console.log('[auth] invitation', data.id, data.email)
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          const [{ total }] = await db
            .select({ total: count() })
            .from(schema.user)

          if (Number(total) !== 1)
            return

          await db
            .update(schema.user)
            .set({ role: 'admin' })
            .where(eq(schema.user.id, user.id))
        },
      },
    },
  },
})
