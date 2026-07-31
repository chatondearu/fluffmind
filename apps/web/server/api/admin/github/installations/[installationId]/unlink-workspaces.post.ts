import { requireAdminInstance } from '../../../../../utils/admin'
import { assertConfirmInstallationId, unlinkAllWorkspacesForInstallation } from '../../../../../utils/admin-github'
import { readJsonBody } from '../../../../../utils/read-json-body'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }
  const body = await readJsonBody<{ confirmInstallationId?: string }>(event)
  assertConfirmInstallationId(installationId, body.confirmInstallationId)
  const result = await unlinkAllWorkspacesForInstallation(installationId)
  return { ok: true, installationId, ...result }
})
