import { requireAdminInstance } from '../../../utils/admin'
import { assertConfirmSlug, rebindOrphanFolder } from '../../../utils/admin-workspaces'
import { readJsonBody } from '../../../utils/read-json-body'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const body = await readJsonBody<{
    organizationId?: string
    folderName?: string
    confirmSlug?: string
  }>(event)

  if (!body.organizationId || !body.folderName) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  assertConfirmSlug(body.folderName, body.confirmSlug)
  const { vaultPath } = await rebindOrphanFolder({
    organizationId: body.organizationId,
    folderName: body.folderName,
  })

  return { ok: true, vaultPath, organizationId: body.organizationId }
})
