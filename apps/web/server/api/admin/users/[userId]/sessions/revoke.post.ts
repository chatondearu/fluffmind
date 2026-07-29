import { getDb, session } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  const db = getDb()
  await db.delete(session).where(eq(session.userId, userId))

  return { ok: true }
})
