export type GitHubCollaboratorPermission = 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
export type WorkspaceMemberPermission = 'read' | 'write' | 'owner'

interface GitHubPermissionsPayload {
  pull?: boolean
  triage?: boolean
  push?: boolean
  maintain?: boolean
  admin?: boolean
}

interface GitHubCollaboratorApiPayload {
  login: string
  role_name?: string
  permissions?: GitHubPermissionsPayload
}

export interface GitHubCollaborator {
  login: string
  permission: GitHubCollaboratorPermission
}

function pickPermission(payload: GitHubCollaboratorApiPayload): GitHubCollaboratorPermission {
  if (payload.role_name) {
    return payload.role_name as GitHubCollaboratorPermission
  }

  const permissions = payload.permissions ?? {}
  if (permissions.admin) return 'admin'
  if (permissions.maintain) return 'maintain'
  if (permissions.push) return 'push'
  if (permissions.triage) return 'triage'
  return 'pull'
}

export function mapGitHubPermission(permission: GitHubCollaboratorPermission): WorkspaceMemberPermission {
  switch (permission) {
    case 'pull':
    case 'triage':
      return 'read'
    case 'push':
    case 'maintain':
      return 'write'
    case 'admin':
      return 'owner'
    default: {
      const exhaustive: never = permission
      throw new Error(`Unsupported GitHub permission "${exhaustive}"`)
    }
  }
}

export async function fetchCollaborators(token: string, owner: string, repo: string): Promise<GitHubCollaborator[]> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators?per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fluffmind-integrations',
    },
  })

  if (!response.ok) {
    let details = ''

    try {
      const body = await response.json() as { message?: string }
      details = body.message ? `: ${body.message}` : ''
    } catch {
      details = ''
    }

    throw new Error(`GitHub collaborators request failed (${response.status})${details}`)
  }

  const data = await response.json() as GitHubCollaboratorApiPayload[]

  return data.map((collaborator) => ({
    login: collaborator.login,
    permission: pickPermission(collaborator),
  }))
}
