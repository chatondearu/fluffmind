import { isGitHubAppConfigured } from '../../../utils/github-credentials'

export default defineEventHandler(() => {
  return { configured: isGitHubAppConfigured() }
})
