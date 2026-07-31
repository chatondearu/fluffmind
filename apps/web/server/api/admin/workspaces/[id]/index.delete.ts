import { getDb, organization } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../utils/admin'
import { assertConfirmSlug, deleteAdminWorkspace } from '../../../../utils/admin-workspaces'
import { readJsonBody } from '../../../../utils/read-json-body'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })

  const body = await readJsonBody<{ confirmSlug?: string }>(event)
  const db = getDb()
  const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }
  assertConfirmSlug(org.slug, body.confirmSlug)
  await deleteAdminWorkspace(id)
  return { ok: true, workspaceId: id }
})
