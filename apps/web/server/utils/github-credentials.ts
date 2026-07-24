import { getDb, workspaceGithubLink } from '@fluffmind/db'
import { createInstallationToken } from '@fluffmind/integrations'
import { eq } from 'drizzle-orm'

import { decryptSyncToken } from './github-sync'

export type GitHubAuthMode = 'app' | 'pat'

export interface ResolvedGitHubCredentials {
  mode: GitHubAuthMode
  token: string
  owner: string
  repo: string
  installationId?: string
}

function getGitHubAppCredentials(): { appId: string, privateKey: string } | null {
  const appId = process.env.GITHUB_APP_ID?.trim()
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim().replace(/\\n/g, '\n')

  if (!appId || !privateKey)
    return null

  return { appId, privateKey }
}

export function isGitHubAppConfigured(): boolean {
  return getGitHubAppCredentials() !== null
}

export async function resolveWorkspaceGitHubCredentials(
  organizationId: string,
): Promise<ResolvedGitHubCredentials | null> {
  const db = getDb()
  const [link] = await db
    .select({
      authMode: workspaceGithubLink.authMode,
      installationId: workspaceGithubLink.installationId,
      owner: workspaceGithubLink.owner,
      repo: workspaceGithubLink.repo,
      syncToken: workspaceGithubLink.syncToken,
    })
    .from(workspaceGithubLink)
    .where(eq(workspaceGithubLink.organizationId, organizationId))
    .limit(1)

  if (!link)
    return null

  if (link.authMode === 'app') {
    const credentials = getGitHubAppCredentials()
    if (!credentials)
      throw new Error('GitHub App credentials are not configured.')
    if (!link.installationId)
      throw new Error('Workspace GitHub App link is missing an installation ID.')

    const { token } = await createInstallationToken(credentials, link.installationId)
    return {
      mode: 'app',
      token,
      owner: link.owner,
      repo: link.repo,
      installationId: link.installationId,
    }
  }

  if (!link.syncToken)
    throw new Error('Workspace GitHub PAT link is missing a sync token.')

  return {
    mode: 'pat',
    token: decryptSyncToken(link.syncToken),
    owner: link.owner,
    repo: link.repo,
  }
}
