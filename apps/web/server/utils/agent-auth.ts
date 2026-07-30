import type { H3Event } from 'h3'
import { extractAgentBearerToken, resolveAgentBearerAuth, type AgentTokenScope } from './agent-tokens'

/** Resolve the Bearer agent token on the request, or throw 401. No session cookie fallback. */
export async function requireAgentBearer(event: H3Event): Promise<{
  workspaceId: string
  scope: AgentTokenScope
  tokenId: string
}> {
  const token = extractAgentBearerToken(getHeader(event, 'authorization'))
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Missing or invalid agent Bearer token.',
    })
  }
  return resolveAgentBearerAuth(token)
}

export function assertAgentWriteScope(scope: AgentTokenScope): void {
  if (scope !== 'write') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'This agent token is read-only.',
    })
  }
}
