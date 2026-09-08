import { listGithubAppInstallations, requireGithubAppListAccess } from '../../../utils/github-installations'

export default defineEventHandler(async (event) => {
  await requireGithubAppListAccess(event)

  const installations = await listGithubAppInstallations()
  return { installations }
})
