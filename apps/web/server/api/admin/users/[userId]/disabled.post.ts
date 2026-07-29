import { getDb, user } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../utils/admin'
import { readJsonBody } from '../../../../utils/read-json-body'

type DisableBody = {
  disabled: boolean
}

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  const body = await readJsonBody<DisableBody>(event)
  if (typeof body?.disabled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      message: '"disabled" must be a boolean.',
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

  const disabledAt = body.disabled ? new Date() : null
  await db.update(user).set({ disabledAt }).where(eq(user.id, userId))

  return { ok: true }
})
