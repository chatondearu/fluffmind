import { getDb, githubAppInstallation, organization, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { fetchInstallationAccount, upsertGithubAppInstallation } from './github-installations'

export interface AdminGithubLinkedWorkspace {
  organizationId: string
  name: string
  slug: string
  owner: string
  repo: string
}

export interface AdminGithubInstallationRow {
  id: string
  installationId: string
  accountLogin: string
  accountType: string
  createdAt: string
  updatedAt: string
  linkedWorkspaces: AdminGithubLinkedWorkspace[]
}

export function assertConfirmInstallationId(expected: string, provided: unknown): void {
  if (typeof provided !== 'string' || provided.trim() !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Confirmation mismatch',
      message: `Type "${expected}" to confirm this action.`,
    })
  }
}

export async function listAdminGithubInstallations(): Promise<AdminGithubInstallationRow[]> {
  const db = getDb()
  const installations = await db.select().from(githubAppInstallation)

  const links = await db
    .select({
      installationId: workspaceGithubLink.installationId,
      organizationId: workspaceGithubLink.organizationId,
      owner: workspaceGithubLink.owner,
      repo: workspaceGithubLink.repo,
      name: organization.name,
      slug: organization.slug,
    })
    .from(workspaceGithubLink)
    .innerJoin(organization, eq(organization.id, workspaceGithubLink.organizationId))

  return installations.map((row) => ({
    id: row.id,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    linkedWorkspaces: links
      .filter(link => link.installationId === row.installationId)
      .map(link => ({
        organizationId: link.organizationId,
        name: link.name,
        slug: link.slug,
        owner: link.owner,
        repo: link.repo,
      })),
  }))
}

export async function unlinkAllWorkspacesForInstallation(installationId: string): Promise<{ unlinked: number }> {
  const db = getDb()
  const [existing] = await db
    .select({ installationId: githubAppInstallation.installationId })
    .from(githubAppInstallation)
    .where(eq(githubAppInstallation.installationId, installationId))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No GitHub App installation "${installationId}" in the database.`,
    })
  }

  const linked = await db
    .select({ organizationId: workspaceGithubLink.organizationId })
    .from(workspaceGithubLink)
    .where(eq(workspaceGithubLink.installationId, installationId))

  await db.delete(workspaceGithubLink).where(eq(workspaceGithubLink.installationId, installationId))

  for (const link of linked) {
    await db
      .update(workspaceConfig)
      .set({ gitRemoteUrl: null })
      .where(eq(workspaceConfig.organizationId, link.organizationId))
  }

  return { unlinked: linked.length }
}

export async function resyncAdminGithubInstallation(installationId: string): Promise<AdminGithubInstallationRow> {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(githubAppInstallation)
    .where(eq(githubAppInstallation.installationId, installationId))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No GitHub App installation "${installationId}" in the database.`,
    })
  }

  try {
    const account = await fetchInstallationAccount(installationId)
    await upsertGithubAppInstallation({
      installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
    })
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error)
      throw error
    throw createError({
      statusCode: 502,
      statusMessage: 'GitHub App request failed',
      message: error instanceof Error ? error.message : 'Failed to refresh installation from GitHub.',
    })
  }

  const rows = await listAdminGithubInstallations()
  const row = rows.find(r => r.installationId === installationId)
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `Installation "${installationId}" disappeared after resync.`,
    })
  }
  return row
}
