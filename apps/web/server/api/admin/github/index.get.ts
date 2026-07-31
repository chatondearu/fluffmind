import { requireAdminInstance } from '../../../utils/admin'
import { listAdminGithubInstallations } from '../../../utils/admin-github'
import { fetchGitHubAppStatus } from '../../../utils/github-app-status'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const appStatus = await fetchGitHubAppStatus()
  const installations = await listAdminGithubInstallations()
  const slug = process.env.GITHUB_APP_SLUG?.trim()
  const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null
  return { appStatus, installations, installUrl }
})
