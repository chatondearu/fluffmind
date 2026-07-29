import { getDb, session, user } from '@fluffmind/db'
import { count, eq } from 'drizzle-orm'

import { INSTANCE_ADMIN_ROLE, requireAdminInstance } from '../../../../utils/admin'
import { isInstanceAdminRole, wouldRemoveLastAdmin } from '../../../../utils/admin-guards'
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
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!target) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  if (body.disabled && isInstanceAdminRole(target.role)) {
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(user)
      .where(eq(user.role, INSTANCE_ADMIN_ROLE))

    if (wouldRemoveLastAdmin({
      targetIsAdmin: true,
      adminCount: Number(total),
    })) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Last admin',
        message: 'Cannot disable the last instance admin.',
      })
    }
  }

  const disabledAt = body.disabled ? new Date() : null
  await db.update(user).set({ disabledAt }).where(eq(user.id, userId))

  if (body.disabled)
    await db.delete(session).where(eq(session.userId, userId))

  return { ok: true }
})
