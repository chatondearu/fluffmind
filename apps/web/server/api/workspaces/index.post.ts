import { mkdir } from 'node:fs/promises'
import { auth, getDb, workspaceConfig } from '@fluffmind/db'
import { readJsonBody } from '../../utils/read-json-body'
import { ACTIVE_WORKSPACE_COOKIE, getWorkspaceVaultPath } from '../../vault/workspace'
import { isAuthEnabled, requireSession } from '../../utils/auth'

interface CreateWorkspaceBody {
  name?: string
  slug?: string
  logo?: string | null
  gitRemoteUrl?: string | null
  gitBranch?: string
}

interface CreatedOrganization {
  id: string
  name: string
  slug: string
  logo: string | null
}

function slugifyWorkspaceName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

function asCreatedOrganization(input: unknown): CreatedOrganization {
  if (!input || typeof input !== 'object') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invalid organization response',
      message: 'Organization API returned an unexpected payload.'
    })
  }

  const value = input as Partial<CreatedOrganization>
  if (!value.id || !value.name || !value.slug) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invalid organization response',
      message: 'Organization API returned incomplete organization data.'
    })
  }

  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    logo: value.logo ?? null
  }
}

export default defineEventHandler(async (event) => {
  if (!isAuthEnabled()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Auth disabled',
      message: 'Workspace creation is only available when authentication is enabled.'
    })
  }

  await requireSession(event)
  const body = await readJsonBody<CreateWorkspaceBody>(event)

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "name" in request body' })
  }

  const slugInput = typeof body.slug === 'string' ? body.slug.trim() : ''
  const slug = slugInput || slugifyWorkspaceName(name)
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid slug',
      message: 'Workspace slug cannot be empty.'
    })
  }

  const created = await auth.api.createOrganization({
    headers: event.headers,
    body: {
      name,
      slug,
      logo: body.logo ?? undefined
    }
  })
  const organization = asCreatedOrganization(created)

  const gitBranch = typeof body.gitBranch === 'string' && body.gitBranch.trim() ? body.gitBranch.trim() : 'main'
  const gitRemoteUrl = typeof body.gitRemoteUrl === 'string' && body.gitRemoteUrl.trim() ? body.gitRemoteUrl.trim() : null
  const vaultPath = getWorkspaceVaultPath(organization.id)
  await mkdir(vaultPath, { recursive: true })

  const db = getDb()
  await db.insert(workspaceConfig).values({
    organizationId: organization.id,
    vaultPath,
    gitBranch,
    gitRemoteUrl
  })

  setCookie(event, ACTIVE_WORKSPACE_COOKIE, organization.id, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true
  })

  return {
    organization,
    config: {
      organizationId: organization.id,
      vaultPath,
      gitBranch,
      gitRemoteUrl
    }
  }
})
