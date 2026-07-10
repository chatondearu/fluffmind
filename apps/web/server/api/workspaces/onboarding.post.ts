import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { auth, getDb, member, workspaceConfig } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { isAuthEnabled, requireSession } from '../../utils/auth'
import { ACTIVE_WORKSPACE_COOKIE, getWorkspaceVaultPath } from '../../vault/workspace'

/**
 * Ensures the signed-in user belongs to at least one workspace.
 * Creates a default workspace on first login/signup when none exists.
 */
export default defineEventHandler(async (event) => {
  if (!isAuthEnabled()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Auth disabled',
      message: 'Onboarding is only available when authentication is enabled.',
    })
  }

  const session = await requireSession(event)
  const db = getDb()

  const [existingMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .limit(1)

  if (existingMembership) {
    setCookie(event, ACTIVE_WORKSPACE_COOKIE, existingMembership.organizationId, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
    })
    return { created: false, organizationId: existingMembership.organizationId }
  }

  const displayName = session.user.name?.trim() || session.user.email.split('@')[0] || 'Workspace'
  const workspaceName = `${displayName}'s vault`
  const slug = workspaceName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || `ws-${session.user.id.slice(0, 8)}`

  const created = await auth.api.createOrganization({
    headers: event.headers,
    body: {
      name: workspaceName,
      slug,
    },
  })

  if (!created?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Workspace creation failed',
    })
  }

  const vaultPath = getWorkspaceVaultPath(created.id)
  await mkdir(vaultPath, { recursive: true })

  const welcomePath = join(vaultPath, 'welcome.md')
  await writeFile(
    welcomePath,
    `# Welcome to Fluffmind\n\nYour vault is ready. Create notes from the home page or edit this file.\n`,
    'utf-8',
  )

  await db.insert(workspaceConfig).values({
    organizationId: created.id,
    vaultPath,
    gitBranch: 'main',
    gitRemoteUrl: null,
  })

  setCookie(event, ACTIVE_WORKSPACE_COOKIE, created.id, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  })

  return {
    created: true,
    organizationId: created.id,
    organization: {
      id: created.id,
      name: created.name,
      slug: created.slug,
    },
  }
})
