import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getDb, organization, workspaceAgentToken, workspaceConfig } from '@fluffmind/db'
import { and, eq, isNull } from 'drizzle-orm'

export type AgentTokenScope = 'read' | 'write'

export interface AgentTokenPublic {
  id: string
  name: string
  scope: AgentTokenScope
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreatedAgentToken extends AgentTokenPublic {
  /** Plaintext secret — returned only at creation time. */
  token: string
}

export interface ResolvedAgentTokenAuth {
  workspaceId: string
  scope: AgentTokenScope
  tokenId: string
}

const TOKEN_PREFIX_LEN = 8
const TOKEN_SECRET_BYTES = 24

/**
 * getDb() throws a plain (non-H3) Error when DATABASE_URL is unset. Agent
 * auth/workspace lookups are reachable from unauthenticated Bearer requests
 * and from the no-auth P1 MCP path, so surface a clear 503 instead of an
 * opaque 500 when the database isn't configured.
 */
function getAgentDb(): ReturnType<typeof getDb> {
  try {
    return getDb()
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Agent access requires a configured database: set DATABASE_URL and ensure AUTH_DISABLED is not "true".',
    })
  }
}

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateAgentTokenPlaintext(): { token: string, tokenPrefix: string } {
  const tokenPrefix = randomBytes(TOKEN_PREFIX_LEN / 2).toString('hex')
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('hex')
  return {
    tokenPrefix,
    token: `fm_agent_${tokenPrefix}_${secret}`,
  }
}

/** Legacy `fm_mcp_` tokens issued before the MCP → Agent rename remain valid. */
function isAgentBearerToken(value: string): boolean {
  return value.startsWith('fm_agent_') || value.startsWith('fm_mcp_')
}

/** Extract Bearer token from Authorization header when it looks like an agent token. */
export function extractAgentBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader)
    return null
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  if (!match)
    return null
  const token = match[1]!.trim()
  return isAgentBearerToken(token) ? token : null
}

export async function getWorkspaceAgentStatus(organizationId: string): Promise<{
  agentEnabled: boolean
  tokens: AgentTokenPublic[]
}> {
  const db = getDb()
  const [config] = await db
    .select({ agentEnabled: workspaceConfig.agentEnabled })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, organizationId))
    .limit(1)

  const rows = await db
    .select({
      id: workspaceAgentToken.id,
      name: workspaceAgentToken.name,
      scope: workspaceAgentToken.scope,
      tokenPrefix: workspaceAgentToken.tokenPrefix,
      createdAt: workspaceAgentToken.createdAt,
      lastUsedAt: workspaceAgentToken.lastUsedAt,
      revokedAt: workspaceAgentToken.revokedAt,
    })
    .from(workspaceAgentToken)
    .where(eq(workspaceAgentToken.organizationId, organizationId))

  return {
    agentEnabled: config?.agentEnabled ?? false,
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

export async function setWorkspaceAgentEnabled(organizationId: string, agentEnabled: boolean): Promise<void> {
  const db = getDb()
  await db
    .update(workspaceConfig)
    .set({ agentEnabled })
    .where(eq(workspaceConfig.organizationId, organizationId))
}

export async function createWorkspaceAgentToken(options: {
  organizationId: string
  name: string
  scope: AgentTokenScope
  createdByUserId: string
}): Promise<CreatedAgentToken> {
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
    .select({ agentEnabled: workspaceConfig.agentEnabled })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, options.organizationId))
    .limit(1)

  if (!config?.agentEnabled) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Agent access disabled',
      message: 'Enable agent access for this workspace before creating tokens.',
    })
  }

  const { token, tokenPrefix } = generateAgentTokenPlaintext()
  const id = randomUUID()
  const createdAt = new Date()

  await db.insert(workspaceAgentToken).values({
    id,
    organizationId: options.organizationId,
    name,
    scope: options.scope,
    tokenPrefix,
    tokenHash: hashAgentToken(token),
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

export async function revokeWorkspaceAgentToken(organizationId: string, tokenId: string): Promise<void> {
  const db = getDb()
  const [row] = await db
    .select({ id: workspaceAgentToken.id, revokedAt: workspaceAgentToken.revokedAt })
    .from(workspaceAgentToken)
    .where(and(
      eq(workspaceAgentToken.id, tokenId),
      eq(workspaceAgentToken.organizationId, organizationId),
    ))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Token not found',
      message: 'Agent token not found for this workspace.',
    })
  }

  if (row.revokedAt)
    return

  await db
    .update(workspaceAgentToken)
    .set({ revokedAt: new Date() })
    .where(eq(workspaceAgentToken.id, tokenId))
}

/**
 * Resolve a plaintext agent Bearer token (current `fm_agent_` or legacy `fm_mcp_`) to
 * workspace + scope. Throws H3 errors for invalid / revoked / agent-disabled.
 */
export async function resolveAgentBearerAuth(token: string): Promise<ResolvedAgentTokenAuth> {
  const db = getAgentDb()
  const tokenHash = hashAgentToken(token)

  const [row] = await db
    .select({
      id: workspaceAgentToken.id,
      organizationId: workspaceAgentToken.organizationId,
      scope: workspaceAgentToken.scope,
      revokedAt: workspaceAgentToken.revokedAt,
      agentEnabled: workspaceConfig.agentEnabled,
    })
    .from(workspaceAgentToken)
    .innerJoin(
      workspaceConfig,
      eq(workspaceConfig.organizationId, workspaceAgentToken.organizationId),
    )
    .where(eq(workspaceAgentToken.tokenHash, tokenHash))
    .limit(1)

  if (!row || row.revokedAt) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid or revoked agent token.',
    })
  }

  if (!row.agentEnabled) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Agent access is disabled for this workspace.',
    })
  }

  await db
    .update(workspaceAgentToken)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(workspaceAgentToken.id, row.id), isNull(workspaceAgentToken.revokedAt)))

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
  agentEnabled: boolean
} | null> {
  const db = getAgentDb()
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      agentEnabled: workspaceConfig.agentEnabled,
    })
    .from(organization)
    .leftJoin(workspaceConfig, eq(workspaceConfig.organizationId, organization.id))
    .where(eq(organization.id, workspaceId))
    .limit(1)

  if (!row) return null
  return { id: row.id, name: row.name, slug: row.slug, agentEnabled: row.agentEnabled ?? false }
}
