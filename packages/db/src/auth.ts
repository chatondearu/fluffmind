import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'

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
})
