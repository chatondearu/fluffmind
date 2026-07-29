import { getDb, user } from '@fluffmind/db'
import { desc } from 'drizzle-orm'

import { requireAdminInstance } from '../../utils/admin'
import { parseAdminUsersLimit } from '../../utils/admin-guards'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)

  const query = getQuery(event)
  const limit = parseAdminUsersLimit(query.limit)

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
