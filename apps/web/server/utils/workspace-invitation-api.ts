import type { GitHubInviteCandidate } from '@fluffmind/integrations'

export type WorkspaceRole = 'read' | 'write' | 'owner'

export interface WorkspaceInvitationBody {
  email?: string
  githubLogin?: string
  role: WorkspaceRole
}

const workspaceRoles = new Set<WorkspaceRole>(['read', 'write', 'owner'])

export function parseWorkspaceInvitationBody(body: unknown): WorkspaceInvitationBody {
  const input = body && typeof body === 'object'
    ? body as Record<string, unknown>
    : {}
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  const githubLogin = typeof input.githubLogin === 'string' ? input.githubLogin.trim() : ''

  if (!email && !githubLogin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation target required',
      message: 'An email address or GitHub login is required.',
    })
  }

  if (typeof input.role !== 'string' || !workspaceRoles.has(input.role as WorkspaceRole)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role',
      message: 'Role must be read, write, or owner.',
    })
  }

  return {
    ...(email ? { email } : {}),
    ...(githubLogin ? { githubLogin } : {}),
    role: input.role as WorkspaceRole,
  }
}

export function filterGitHubInviteCandidates(
  candidates: GitHubInviteCandidate[],
  unavailableIdentities: Iterable<string>,
): GitHubInviteCandidate[] {
  const unavailable = new Set(
    Array.from(unavailableIdentities, identity => identity.trim().toLowerCase()),
  )

  return candidates.filter(candidate =>
    !unavailable.has(candidate.login.toLowerCase())
    && !unavailable.has(candidate.id.toLowerCase()),
  )
}
