import { fetchGitHubAppStatus } from '../../../utils/github-app-status'

export default defineEventHandler(async () => {
  return fetchGitHubAppStatus()
})
