import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getDb, organization, workspaceConfig, workspaceMcpToken } from '@fluffmind/db'
import { and, eq, isNull } from 'drizzle-orm'

export type McpTokenScope = 'read' | 'write'

export interface McpTokenPublic {
  id: string
  name: string
  scope: McpTokenScope
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreatedMcpToken extends McpTokenPublic {
  /** Plaintext secret — returned only at creation time. */
  token: string
}

export interface ResolvedMcpTokenAuth {
  workspaceId: string
  scope: McpTokenScope
  tokenId: string
}

const TOKEN_PREFIX_LEN = 8
const TOKEN_SECRET_BYTES = 24

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateMcpTokenPlaintext(): { token: string, tokenPrefix: string } {
  const tokenPrefix = randomBytes(TOKEN_PREFIX_LEN / 2).toString('hex')
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('hex')
  return {
    tokenPrefix,
    token: `fm_mcp_${tokenPrefix}_${secret}`,
  }
}

function isMcpBearerToken(value: string): boolean {
  return value.startsWith('fm_mcp_')
}

/** Extract Bearer token from Authorization header when it looks like an MCP token. */
export function extractMcpBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader)
    return null
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  if (!match)
    return null
  const token = match[1]!.trim()
  return isMcpBearerToken(token) ? token : null
}

export async function getWorkspaceMcpStatus(organizationId: string): Promise<{
  mcpEnabled: boolean
  tokens: McpTokenPublic[]
}> {
  const db = getDb()
  const [config] = await db
    .select({ mcpEnabled: workspaceConfig.mcpEnabled })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, organizationId))
    .limit(1)

  const rows = await db
    .select({
      id: workspaceMcpToken.id,
      name: workspaceMcpToken.name,
      scope: workspaceMcpToken.scope,
      tokenPrefix: workspaceMcpToken.tokenPrefix,
      createdAt: workspaceMcpToken.createdAt,
      lastUsedAt: workspaceMcpToken.lastUsedAt,
      revokedAt: workspaceMcpToken.revokedAt,
    })
    .from(workspaceMcpToken)
    .where(eq(workspaceMcpToken.organizationId, organizationId))

  return {
    mcpEnabled: config?.mcpEnabled ?? false,
    tokens: rows.map(row => ({
      id: row.id,
      name: row.name,
      scope: row.scope,
      tokenPrefix: row.tokenPrefix,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    })),
  }
}

export async function setWorkspaceMcpEnabled(organizationId: string, mcpEnabled: boolean): Promise<void> {
  const db = getDb()
  await db
    .update(workspaceConfig)
    .set({ mcpEnabled })
    .where(eq(workspaceConfig.organizationId, organizationId))
}

export async function createWorkspaceMcpToken(options: {
  organizationId: string
  name: string
  scope: McpTokenScope
  createdByUserId: string
}): Promise<CreatedMcpToken> {
  const name = options.name.trim()
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid name',
      message: 'Token name is required.',
    })
  }
  if (options.scope !== 'read' && options.scope !== 'write') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid scope',
      message: 'Scope must be "read" or "write".',
    })
  }

  const db = getDb()
  const [config] = await db
    .select({ mcpEnabled: workspaceConfig.mcpEnabled })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, options.organizationId))
    .limit(1)

  if (!config?.mcpEnabled) {
    throw createError({
      statusCode: 400,
      statusMessage: 'MCP disabled',
      message: 'Enable MCP for this workspace before creating tokens.',
    })
  }

  const { token, tokenPrefix } = generateMcpTokenPlaintext()
  const id = randomUUID()
  const createdAt = new Date()

  await db.insert(workspaceMcpToken).values({
    id,
    organizationId: options.organizationId,
    name,
    scope: options.scope,
    tokenPrefix,
    tokenHash: hashMcpToken(token),
    createdByUserId: options.createdByUserId,
    createdAt,
  })

  return {
    id,
    name,
    scope: options.scope,
    tokenPrefix,
    token,
    createdAt: createdAt.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  }
}

export async function revokeWorkspaceMcpToken(organizationId: string, tokenId: string): Promise<void> {
  const db = getDb()
  const [row] = await db
    .select({ id: workspaceMcpToken.id, revokedAt: workspaceMcpToken.revokedAt })
    .from(workspaceMcpToken)
    .where(and(
      eq(workspaceMcpToken.id, tokenId),
      eq(workspaceMcpToken.organizationId, organizationId),
    ))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Token not found',
      message: 'MCP token not found for this workspace.',
    })
  }

  if (row.revokedAt)
    return

  await db
    .update(workspaceMcpToken)
    .set({ revokedAt: new Date() })
    .where(eq(workspaceMcpToken.id, tokenId))
}

/**
 * Resolve a plaintext MCP Bearer token to workspace + scope.
 * Throws H3 errors for invalid / revoked / MCP-disabled.
 */
export async function resolveMcpBearerAuth(token: string): Promise<ResolvedMcpTokenAuth> {
  const db = getDb()
  const tokenHash = hashMcpToken(token)

  const [row] = await db
    .select({
      id: workspaceMcpToken.id,
      organizationId: workspaceMcpToken.organizationId,
      scope: workspaceMcpToken.scope,
      revokedAt: workspaceMcpToken.revokedAt,
      mcpEnabled: workspaceConfig.mcpEnabled,
    })
    .from(workspaceMcpToken)
    .innerJoin(
      workspaceConfig,
      eq(workspaceConfig.organizationId, workspaceMcpToken.organizationId),
    )
    .where(eq(workspaceMcpToken.tokenHash, tokenHash))
    .limit(1)

  if (!row || row.revokedAt) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid or revoked MCP token.',
    })
  }

  if (!row.mcpEnabled) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'MCP is disabled for this workspace.',
    })
  }

  await db
    .update(workspaceMcpToken)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(workspaceMcpToken.id, row.id), isNull(workspaceMcpToken.revokedAt)))

  return {
    workspaceId: row.organizationId,
    scope: row.scope,
    tokenId: row.id,
  }
}

export async function getWorkspaceIdentity(workspaceId: string): Promise<{
  id: string
  name: string
  slug: string
} | null> {
  const db = getDb()
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .limit(1)

  return row ?? null
}
