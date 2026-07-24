import { isAuthEnabled } from '../utils/auth'
import { getWebhookSecret } from '../utils/github-webhook'
import { getWorkspaceSyncStatus } from '../vault/sync'

export default defineEventHandler(async () => {
  const syncStatus = await getWorkspaceSyncStatus('default')

  return {
    authEnabled: isAuthEnabled(),
    gitRemoteConfigured: Boolean(process.env.GIT_REMOTE_URL?.trim()),
    webhookConfigured: Boolean(getWebhookSecret()),
    githubOAuthConfigured: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
    ),
    branch: process.env.GIT_BRANCH || 'main',
    sync: syncStatus,
  }
})
