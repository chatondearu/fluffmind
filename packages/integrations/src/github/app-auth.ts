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

type AppAuthFactory = (options: StrategyOptions) => InstallationAuth

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
