import { randomUUID } from 'node:crypto'
import { getDb, githubAppInstallation, member, workspaceGithubLink } from '@fluffmind/db'
import { createInstallationToken } from '@fluffmind/integrations'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'

import { requireSession } from './auth'
import { getGitHubAppCredentials } from './github-credentials'
import { parseRepoIdentifier } from './github-sync'

export interface GithubAppInstallationRecord {
  id: string
  installationId: string
  accountLogin: string
  accountType: string
  createdAt: string
  updatedAt: string
}

export interface InstallationRepository {
  id: number
  fullName: string
  ownerLogin: string
  ownerType: string
  private: boolean
}

interface GitHubRepoApiPayload {
  id: number
  full_name: string
  private: boolean
  owner: { login: string, type: string }
}

interface GitHubInstallationRepositoriesResponse {
  total_count: number
  repositories: GitHubRepoApiPayload[]
}

/** Any authenticated user who owns at least one workspace may administer instance-scoped GitHub App installations (v1 authz — see PRD-033). */
export async function requireAnyOwnerMembership(event: H3Event) {
  const session = await requireSession(event)
  const db = getDb()

  const [ownerMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.role, 'owner')))
    .limit(1)

  if (!ownerMembership) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'GitHub App administration requires owner role in at least one workspace.',
    })
  }

  return session
}

export interface UpsertGithubAppInstallationInput {
  installationId: string
  accountLogin: string
  accountType: string
}

export async function upsertGithubAppInstallation(input: UpsertGithubAppInstallationInput): Promise<void> {
  const db = getDb()
  await db
    .insert(githubAppInstallation)
    .values({
      id: randomUUID(),
      installationId: input.installationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
    })
    .onConflictDoUpdate({
      target: githubAppInstallation.installationId,
      set: {
        accountLogin: input.accountLogin,
        accountType: input.accountType,
      },
    })
}

export async function listGithubAppInstallations(): Promise<GithubAppInstallationRecord[]> {
  const db = getDb()
  const rows = await db.select().from(githubAppInstallation)

  return rows.map(row => ({
    id: row.id,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function findGithubAppInstallation(installationId: string): Promise<GithubAppInstallationRecord | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(githubAppInstallation)
    .where(eq(githubAppInstallation.installationId, installationId))
    .limit(1)

  if (!row)
    return null

  return {
    id: row.id,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Uninstall: prune the installation row and every workspace link that relied on it. Vault files on disk are left untouched. */
export async function removeGithubAppInstallation(installationId: string): Promise<void> {
  const db = getDb()
  await db.delete(workspaceGithubLink).where(eq(workspaceGithubLink.installationId, installationId))
  await db.delete(githubAppInstallation).where(eq(githubAppInstallation.installationId, installationId))
}

/** Repo removed from an installation: clear only the workspace links bound to that repo. Vault files on disk are left untouched. */
export async function unlinkWorkspacesForRemovedRepositories(
  installationId: string,
  repoFullNames: string[],
): Promise<void> {
  if (repoFullNames.length === 0)
    return

  const removedRepos = repoFullNames
    .map(parseRepoIdentifier)
    .filter((value): value is { owner: string, repo: string } => value !== null)

  if (removedRepos.length === 0)
    return

  const db = getDb()
  const links = await db
    .select({
      organizationId: workspaceGithubLink.organizationId,
      owner: workspaceGithubLink.owner,
      repo: workspaceGithubLink.repo,
    })
    .from(workspaceGithubLink)
    .where(eq(workspaceGithubLink.installationId, installationId))

  const affected = links.filter(link =>
    removedRepos.some(removed => removed.owner === link.owner && removed.repo === link.repo),
  )

  for (const link of affected) {
    await db.delete(workspaceGithubLink).where(eq(workspaceGithubLink.organizationId, link.organizationId))
  }
}

/** Lists repositories accessible to a GitHub App installation using a freshly minted installation token. */
export async function listInstallationRepositories(installationId: string): Promise<InstallationRepository[]> {
  const credentials = getGitHubAppCredentials()
  if (!credentials) {
    throw new Error('GitHub App credentials are not configured.')
  }

  const { token } = await createInstallationToken(credentials, installationId)
  const repositories: GitHubRepoApiPayload[] = []
  let page = 1

  for (;;) {
    const response = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'fluffmind-web',
        },
      },
    )

    if (!response.ok) {
      const details = await response.json()
        .then((body: { message?: string }) => (body.message ? `: ${body.message}` : ''))
        .catch(() => '')
      throw new Error(`GitHub installation repositories request failed (${response.status})${details}`)
    }

    const body = await response.json() as GitHubInstallationRepositoriesResponse
    repositories.push(...body.repositories)

    if (body.repositories.length < 100)
      break
    page += 1
  }

  return repositories.map(repo => ({
    id: repo.id,
    fullName: repo.full_name,
    ownerLogin: repo.owner.login,
    ownerType: repo.owner.type,
    private: repo.private,
  }))
}

/** Best-effort account info derived from the installation's accessible repos (the install callback has no other way to learn it without a webhook). */
export async function resolveInstallationAccountInfo(
  installationId: string,
): Promise<{ accountLogin: string, accountType: string } | null> {
  const repositories = await listInstallationRepositories(installationId)
  const [first] = repositories
  if (!first)
    return null

  return { accountLogin: first.ownerLogin, accountType: first.ownerType }
}
