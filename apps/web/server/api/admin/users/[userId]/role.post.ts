import { getDb, user } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../utils/admin'
import { readJsonBody } from '../../../../utils/read-json-body'

type UpdateRoleBody = {
  role: 'admin' | 'owner'
}

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  const body = await readJsonBody<UpdateRoleBody>(event)
  if (body?.role !== 'admin' && body?.role !== 'owner') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role',
      message: '"role" must be "admin" or "owner".',
    })
  }

  const db = getDb()
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  await db.update(user).set({ role: body.role }).where(eq(user.id, userId))

  return { ok: true }
})
