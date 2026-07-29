import { getDb, user } from '@fluffmind/db'
import { count, eq } from 'drizzle-orm'

import { INSTANCE_ADMIN_ROLE, requireAdminInstance } from '../../../../utils/admin'
import { isInstanceAdminRole, wouldRemoveLastAdmin } from '../../../../utils/admin-guards'
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

  if (body.role !== INSTANCE_ADMIN_ROLE && isInstanceAdminRole(target.role)) {
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
        message: 'Cannot demote the last instance admin.',
      })
    }
  }

  await db.update(user).set({ role: body.role }).where(eq(user.id, userId))

  return { ok: true }
})
