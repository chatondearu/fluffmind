import { auth } from '@fluffmind/db'
import type { H3Event } from 'h3'

export function isAuthEnabled(): boolean {
  if (process.env.AUTH_DISABLED === 'true')
    return false
  return Boolean(process.env.DATABASE_URL)
}

export async function getSession(event: H3Event) {
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  return session
}

export async function requireSession(event: H3Event) {
  if (!isAuthEnabled())
    return null

  const session = await getSession(event)

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Authentication is required for this endpoint.',
    })
  }

  return session
}
