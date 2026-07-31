import { access, readdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { getDb, organization, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

const DEFAULT_WORKSPACES_ROOT = '/data/workspaces'

export interface AdminWorkspaceRow {
  organizationId: string
  name: string
  slug: string
  vaultPath: string
  vaultExists: boolean
  gitRemoteUrl: string | null
  gitBranch: string
  contentRoots: string[]
  githubLinked: boolean
  githubOwner: string | null
  githubRepo: string | null
  ahead: number | null
  behind: number | null
}

export function getWorkspacesRoot(): string {
  return resolve(process.env.WORKSPACES_ROOT || DEFAULT_WORKSPACES_ROOT)
}

export function isPathWithinRoot(rootPath: string, path: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}${sep}`)
}

export function assertConfirmSlug(expected: string, provided: unknown): void {
  if (typeof provided !== 'string' || provided.trim() !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Confirmation mismatch',
      message: `Type "${expected}" to confirm this action.`,
    })
  }
}

export async function listAdminWorkspaces(): Promise<{
  workspaces: AdminWorkspaceRow[]
  orphans: string[]
}> {
  const db = getDb()
  const root = getWorkspacesRoot()

  const rows = await db
    .select({
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      vaultPath: workspaceConfig.vaultPath,
      gitRemoteUrl: workspaceConfig.gitRemoteUrl,
      gitBranch: workspaceConfig.gitBranch,
      contentRoots: workspaceConfig.contentRoots,
      githubOwner: workspaceGithubLink.owner,
      githubRepo: workspaceGithubLink.repo,
    })
    .from(organization)
    .leftJoin(workspaceConfig, eq(workspaceConfig.organizationId, organization.id))
    .leftJoin(workspaceGithubLink, eq(workspaceGithubLink.organizationId, organization.id))

  const workspaces: AdminWorkspaceRow[] = []
  for (const row of rows) {
    if (!row.vaultPath)
      continue
    let vaultExists = false
    try {
      await access(row.vaultPath)
      vaultExists = true
    }
    catch {
      vaultExists = false
    }
    workspaces.push({
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      vaultPath: row.vaultPath,
      vaultExists,
      gitRemoteUrl: row.gitRemoteUrl,
      gitBranch: row.gitBranch || 'main',
      contentRoots: Array.isArray(row.contentRoots) ? row.contentRoots : [],
      githubLinked: Boolean(row.githubOwner && row.githubRepo),
      githubOwner: row.githubOwner,
      githubRepo: row.githubRepo,
      ahead: null,
      behind: null,
    })
  }

  let orphans: string[] = []
  try {
    const entries = await readdir(root)
    const known = new Set(workspaces.map(w => w.organizationId))
    orphans = entries.filter(name =>
      name !== '.fluffmind-locks'
      && !name.startsWith('.')
      && !known.has(name),
    )
  }
  catch {
    orphans = []
  }

  return { workspaces, orphans }
}
