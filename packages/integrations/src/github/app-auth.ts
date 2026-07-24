import { createAppAuth } from '@octokit/auth-app'
import type { StrategyOptions } from '@octokit/auth-app'

export interface GitHubAppCredentials {
  appId: string
  privateKey: string
}

export interface InstallationTokenOptions {
  repositoryIds?: number[]
  repositories?: string[]
}

interface InstallationAuth {
  (options: {
    type: 'installation'
    installationId: string
    repositoryIds?: number[]
    repositoryNames?: string[]
  }): Promise<{ token: string, expiresAt: string }>
}

interface AppJwtAuth {
  (options: { type: 'app' }): Promise<{ token: string, expiresAt: string }>
}

type AppAuthFactory = (options: StrategyOptions) => InstallationAuth
type AppJwtAuthFactory = (options: StrategyOptions) => AppJwtAuth

export async function createInstallationToken(
  creds: GitHubAppCredentials,
  installationId: string,
  options: InstallationTokenOptions = {},
  authFactory: AppAuthFactory = createAppAuth,
): Promise<{ token: string, expiresAt: string }> {
  const appAuthOptions: StrategyOptions = {
    ...creds,
  }
  const auth = authFactory(appAuthOptions)
  const authentication = await auth({
    type: 'installation',
    installationId,
    ...(options.repositoryIds && { repositoryIds: options.repositoryIds }),
    ...(options.repositories && { repositoryNames: options.repositories }),
  })

  return {
    token: authentication.token,
    expiresAt: authentication.expiresAt,
  }
}

/**
 * Mints a short-lived JWT signed with the App's private key (`type: 'app'` auth), the
 * only credential accepted by App-level endpoints such as
 * `GET /app/installations/{installation_id}` (installation tokens can't call these).
 */
export async function createAppJwt(
  creds: GitHubAppCredentials,
  authFactory: AppJwtAuthFactory = createAppAuth as unknown as AppJwtAuthFactory,
): Promise<{ token: string, expiresAt: string }> {
  const appAuthOptions: StrategyOptions = {
    ...creds,
  }
  const auth = authFactory(appAuthOptions)
  const authentication = await auth({ type: 'app' })

  return {
    token: authentication.token,
    expiresAt: authentication.expiresAt,
  }
}
