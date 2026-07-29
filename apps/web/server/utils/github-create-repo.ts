import { getDb, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import {
  buildGitHubHttpsRemoteUrl,
  createGithubRepository,
  createInstallationToken,
  GithubApiError,
} from '@fluffmind/integrations'
import type { GitHubAppCredentials } from '@fluffmind/integrations'
import { eq } from 'drizzle-orm'

import { getGitHubAppCredentials, isGitHubAppConfigured } from './github-credentials'
import { findGithubAppInstallation } from './github-installations'
import type { GithubAppInstallationRecord } from './github-installations'

export interface CreateGithubRepoBody {
  installationId: string
  name?: string
  private?: boolean
}

export type GithubCreateLinkResult =
  | { ok: true, owner: string, repo: string, htmlUrl: string }
  | { ok: false, message: string }

export function defaultGithubRepoName(workspaceSlug: string): string {
  return `fluff-${workspaceSlug}`
}

export function parseCreateGithubRepoBody(raw: unknown): CreateGithubRepoBody | null {
  if (!raw || typeof raw !== 'object')
    return null

  const body = raw as Record<string, unknown>
  const installationId = typeof body.installationId === 'string' ? body.installationId.trim() : ''

  if (!installationId)
    return null

  return {
    installationId,
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    private: typeof body.private === 'boolean' ? body.private : undefined,
  }
}

/** Throws createError 400 if App/installation invalid. */
export async function assertCanCreateGithubRepo(input: CreateGithubRepoBody): Promise<{
  installation: GithubAppInstallationRecord
  credentials: GitHubAppCredentials
}> {
  const credentials = getGitHubAppCredentials()

  if (!isGitHubAppConfigured() || !credentials) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GitHub App unavailable',
      message: 'GitHub App credentials are not configured.',
    })
  }

  const installation = await findGithubAppInstallation(input.installationId)
  if (!installation) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown installation',
      message: `GitHub App installation ${input.installationId} is not available.`,
    })
  }

  return { installation, credentials }
}

export async function createAndLinkGithubRepo(options: {
  workspaceId: string
  workspaceSlug: string
  input: CreateGithubRepoBody
  /** When true, 409 if workspace already has a github link. */
  refuseIfLinked?: boolean
}): Promise<GithubCreateLinkResult> {
  const { installation, credentials } = await assertCanCreateGithubRepo(options.input)
  const db = getDb()

  if (options.refuseIfLinked !== false) {
    const [existingLink] = await db
      .select({ organizationId: workspaceGithubLink.organizationId })
      .from(workspaceGithubLink)
      .where(eq(workspaceGithubLink.organizationId, options.workspaceId))
      .limit(1)

    if (existingLink) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Sync already active',
        message: 'A sync mode is already active for this workspace. Unlink it before choosing another.',
      })
    }
  }

  const accountType = installation.accountType.toLowerCase() === 'organization'
    ? 'Organization'
    : 'User'

  let repository: Awaited<ReturnType<typeof createGithubRepository>>
  try {
    const { token } = await createInstallationToken(credentials, installation.installationId)
    repository = await createGithubRepository({
      token,
      accountLogin: installation.accountLogin,
      accountType,
      name: options.input.name?.trim() || defaultGithubRepoName(options.workspaceSlug),
      private: options.input.private ?? true,
      autoInit: false,
    })
  }
  catch (error) {
    if (error instanceof GithubApiError)
      return { ok: false, message: error.githubMessage }

    return {
      ok: false,
      message: error instanceof Error ? error.message : 'GitHub repository creation failed.',
    }
  }

  await db
    .insert(workspaceGithubLink)
    .values({
      organizationId: options.workspaceId,
      owner: repository.owner,
      repo: repository.repo,
      authMode: 'app',
      installationId: installation.installationId,
      syncToken: null,
      lastSyncedAt: null,
    })

  await db
    .update(workspaceConfig)
    .set({ gitRemoteUrl: buildGitHubHttpsRemoteUrl(repository.owner, repository.repo) })
    .where(eq(workspaceConfig.organizationId, options.workspaceId))

  return {
    ok: true,
    owner: repository.owner,
    repo: repository.repo,
    htmlUrl: repository.htmlUrl,
  }
}
