import { getDb, organization } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../utils/admin'
import { unlinkWorkspaceGithubSync } from '../../../../utils/github-sync'
import { invalidateVaultIndex } from '../../../../vault/service'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })

  const db = getDb()
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }

  const state = await unlinkWorkspaceGithubSync(id)
  invalidateVaultIndex(id)
  return state
})
