import { requireAdminInstance } from '../../../../../utils/admin'
import { assertConfirmInstallationId } from '../../../../../utils/admin-github'
import { findGithubAppInstallation, removeGithubAppInstallation } from '../../../../../utils/github-installations'
import { readJsonBody } from '../../../../../utils/read-json-body'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }
  const body = await readJsonBody<{ confirmInstallationId?: string }>(event)
  assertConfirmInstallationId(installationId, body.confirmInstallationId)

  const existing = await findGithubAppInstallation(installationId)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No GitHub App installation "${installationId}" in the database.`,
    })
  }

  await removeGithubAppInstallation(installationId)
  return { ok: true, installationId }
})
