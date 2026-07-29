type WorkspaceRole = 'read' | 'write' | 'owner'

interface WorkspaceInvitationPayloadInput {
  email: string
  githubLogin: string
  selectedGithubLogin: string
  role: WorkspaceRole
}

interface WorkspaceInvitationPayload {
  email?: string
  githubLogin?: string
  role: WorkspaceRole
}

interface InvitationRecipient {
  email: string
  githubLogin: string | null
}

interface GithubInviteCandidate {
  login: string
  label: string
}

interface GithubInviteCandidateResponse {
  candidates?: Array<{ login?: string }>
}

export function buildWorkspaceInvitationPayload(
  input: WorkspaceInvitationPayloadInput,
): WorkspaceInvitationPayload | null {
  const email = input.email.trim().toLowerCase()
  const githubLogin = input.githubLogin.trim() || input.selectedGithubLogin.trim()

  if (!email && !githubLogin)
    return null

  return {
    ...(email ? { email } : {}),
    ...(githubLogin ? { githubLogin } : {}),
    role: input.role,
  }
}

export function formatInvitationRecipient(invitation: InvitationRecipient): string {
  return invitation.githubLogin ? `@${invitation.githubLogin}` : invitation.email
}

export async function loadGithubInviteCandidates(
  fetchCandidates: () => Promise<GithubInviteCandidateResponse>,
): Promise<GithubInviteCandidate[]> {
  try {
    const response = await fetchCandidates()
    return Array.isArray(response.candidates)
      ? response.candidates.flatMap((candidate) => {
          const login = typeof candidate.login === 'string' ? candidate.login.trim() : ''
          return login ? [{ login, label: `@${login}` }] : []
        })
      : []
  } catch {
    return []
  }
}

export function extractInvitationIdFromInviteMemberResponse(response: unknown): string | null {
  const asRecord = response as Record<string, unknown> | null
  if (!asRecord || typeof asRecord !== 'object')
    return null

  const topLevelId = asRecord.invitationId
  if (typeof topLevelId === 'string' && topLevelId.trim())
    return topLevelId

  const data = asRecord.data
  const dataRecord = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null
  if (!dataRecord)
    return null

  const id = dataRecord.id
  if (typeof id === 'string' && id.trim())
    return id

  const dataInvitationId = dataRecord.invitationId
  if (typeof dataInvitationId === 'string' && dataInvitationId.trim())
    return dataInvitationId

  return null
}

export function buildAcceptInvitationUrl(invitationId: string): string {
  return `/accept-invitation/${invitationId}`
}

function hasInvitationAcceptError(response: unknown): boolean {
  if (!response || typeof response !== 'object')
    return false

  return Boolean((response as {
    error?: { message?: string | null } | null
  }).error)
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object')
    return null

  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
  }
  const status = candidate.statusCode ?? candidate.status ?? candidate.response?.status
  return typeof status === 'number' ? status : null
}

export async function acceptInvitationWithFallback(
  invitationId: string,
  acceptWithWorkspace: (id: string) => Promise<{ ok: true }>,
  acceptWithBetterAuth: (id: string) => Promise<unknown>,
): Promise<{ ok: true }> {
  try {
    return await acceptWithWorkspace(invitationId)
  } catch (error) {
    if (getErrorStatus(error) !== 404)
      throw error
  }

  const response = await acceptWithBetterAuth(invitationId)
  if (hasInvitationAcceptError(response))
    throw new Error('Impossible d’accepter l’invitation.')

  return { ok: true }
}
