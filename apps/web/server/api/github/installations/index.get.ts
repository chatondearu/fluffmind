import { listGithubAppInstallations, requireAnyOwnerMembership } from '../../../utils/github-installations'

export default defineEventHandler(async (event) => {
  await requireAnyOwnerMembership(event)

  const installations = await listGithubAppInstallations()
  return { installations }
})
