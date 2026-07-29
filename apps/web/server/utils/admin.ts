import type { H3Event } from 'h3'

import { requireSession } from './auth'

export const INSTANCE_ADMIN_ROLE = 'admin' as const

export async function requireAdminInstance(event: H3Event) {
  const session = await requireSession(event)
  const role = (session as { user?: { role?: unknown } })?.user?.role

  if (role !== INSTANCE_ADMIN_ROLE) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Admin instance required.',
    })
  }

  return session
}
