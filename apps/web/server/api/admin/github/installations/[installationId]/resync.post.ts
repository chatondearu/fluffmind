import { requireAdminInstance } from '../../../../../utils/admin'
import { resyncAdminGithubInstallation } from '../../../../../utils/admin-github'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }
  const installation = await resyncAdminGithubInstallation(installationId)
  return { ok: true, installation }
})
