import { getDb, user } from '@fluffmind/db'
import { desc } from 'drizzle-orm'

import { requireAdminInstance } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const query = getQuery(event)
  const limitRaw = query.limit
  const limit = typeof limitRaw === 'string' ? Math.max(1, Number(limitRaw) || 50) : 50

  const db = getDb()
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      disabledAt: user.disabledAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit)

  return {
    users: rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    })),
  }
})
