import { mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { getDb, member, workspaceConfig } from '@fluffmind/db'
import { withGitHubAccessToken } from '@fluffmind/integrations'
import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { isAuthEnabled, requireSession } from '../utils/auth'
import { resolveWorkspaceGitHubCredentials } from '../utils/github-credentials'

const DEFAULT_WORKSPACES_ROOT = '/data/workspaces'
export const ACTIVE_WORKSPACE_COOKIE = 'fluffmind-workspace-id'

export interface WorkspaceConfig {
  path: string
  remoteUrl?: string
  branch: string
  contentRoots: string[]
}

function getWorkspacesRoot(): string {
  return resolve(process.env.WORKSPACES_ROOT || DEFAULT_WORKSPACES_ROOT)
}

function isPathWithinRoot(rootPath: string, path: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}${sep}`)
}

export function getWorkspaceVaultPath(workspaceId: string): string {
  const rootPath = getWorkspacesRoot()
  const vaultPath = resolve(rootPath, workspaceId)
  if (!isPathWithinRoot(rootPath, vaultPath)) {
    throw new Error(`Workspace path escapes WORKSPACES_ROOT: ${workspaceId}`)
  }
  return vaultPath
}

/**
 * Resolves a workspace id to its working-copy config.
 *
 * - Auth off: keeps P1 env-based workspace resolution.
 * - Auth on: loads `workspace_config` from Postgres and ensures the vault directory
 *   exists under `WORKSPACES_ROOT`.
 */
export async function resolveWorkspaceConfig(workspaceId: string): Promise<WorkspaceConfig> {
  if (!isAuthEnabled()) {
    const envConfig = workspaceConfigFromEnv()
    if (!envConfig) throw new Error('VAULT_PATH environment variable is not set')
    return envConfig
  }

  const db = getDb()
  const [config] = await db
    .select()
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, workspaceId))
    .limit(1)

  if (!config) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace config not found',
      message: `No workspace configuration found for organization "${workspaceId}".`
    })
  }

  const rootPath = getWorkspacesRoot()
  const vaultPath = resolve(config.vaultPath)
  if (!isPathWithinRoot(rootPath, vaultPath)) {
    throw new Error(`Workspace vault path is outside WORKSPACES_ROOT for "${workspaceId}"`)
  }

  await mkdir(vaultPath, { recursive: true })
  return {
    path: vaultPath,
    remoteUrl: config.gitRemoteUrl || undefined,
    branch: config.gitBranch || 'main',
    contentRoots: Array.isArray(config.contentRoots) ? config.contentRoots : [],
  }
}

function isGitHubHttpsRemote(remoteUrl: string): boolean {
  try {
    const hostname = new URL(remoteUrl).hostname.toLowerCase()
    return hostname === 'github.com' || hostname === 'www.github.com'
  }
  catch {
    return false
  }
}

export interface WorkspaceGitNetwork {
  /** Clean remote URL stored in workspace_config (no secrets). */
  remoteUrl?: string
  /** Short-lived App installation token or PAT for HTTPS git ops. */
  accessToken?: string
}

/**
 * Resolves clean remote + runtime GitHub credentials for network operations.
 * Tokens are minted/decrypted on demand and never saved in `workspace_config`.
 */
export async function resolveWorkspaceGitNetwork(workspaceId: string): Promise<WorkspaceGitNetwork> {
  const config = await resolveWorkspaceConfig(workspaceId)
  if (!config.remoteUrl)
    return {}

  if (!isAuthEnabled())
    return { remoteUrl: config.remoteUrl }

  const credentials = await resolveWorkspaceGitHubCredentials(workspaceId)
  if (!credentials) {
    if (isGitHubHttpsRemote(config.remoteUrl)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'GitHub credentials unavailable',
        message: 'This workspace has a GitHub remote but no App/PAT link. Unlink or re-link sync in workspace settings.',
      })
    }
    return { remoteUrl: config.remoteUrl }
  }

  return {
    remoteUrl: config.remoteUrl,
    accessToken: credentials.token,
  }
}

/**
 * Resolves the Git remote URL to use for a network operation. GitHub credentials are
 * minted or decrypted on demand and never saved in `workspace_config`.
 */
export async function resolveWorkspaceGitRemoteUrl(workspaceId: string): Promise<string | undefined> {
  const network = await resolveWorkspaceGitNetwork(workspaceId)
  if (!network.remoteUrl)
    return undefined
  if (!network.accessToken)
    return network.remoteUrl
  return withGitHubAccessToken(network.remoteUrl, network.accessToken)
}

export async function resolveActiveWorkspaceId(event: H3Event): Promise<string> {
  if (!isAuthEnabled()) return 'default'

  const session = await requireSession(event)
  const db = getDb()
  const preferredWorkspaceId = getCookie(event, ACTIVE_WORKSPACE_COOKIE) || session.session.activeOrganizationId || ''

  if (preferredWorkspaceId) {
    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.organizationId, preferredWorkspaceId), eq(member.userId, session.user.id)))
      .limit(1)

    if (membership) {
      setCookie(event, ACTIVE_WORKSPACE_COOKIE, membership.organizationId, {
        path: '/',
        sameSite: 'lax',
        httpOnly: true
      })
      return membership.organizationId
    }
  }

  const [firstMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .limit(1)

  if (!firstMembership) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No workspace membership',
      message: 'You are not a member of any workspace.'
    })
  }

  setCookie(event, ACTIVE_WORKSPACE_COOKIE, firstMembership.organizationId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true
  })

  return firstMembership.organizationId
}

export function workspaceConfigFromEnv(): WorkspaceConfig | null {
  const path = process.env.VAULT_PATH
  if (!path) return null
  return {
    path,
    remoteUrl: process.env.GIT_REMOTE_URL || undefined,
    branch: process.env.GIT_BRANCH || 'main',
    contentRoots: [],
  }
}
