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
  id?: number
  login: string
  avatar_url?: string | null
  role_name?: string
  permissions?: GitHubPermissionsPayload
}

export interface GitHubCollaborator {
  login: string
  permission: GitHubCollaboratorPermission
  id?: string
  avatarUrl?: string | null
}

// GitHub reports a collaborator's role two ways that do NOT share a vocabulary:
//   - `permissions`: cumulative booleans keyed by the API names
//     (pull ⊂ triage ⊂ push ⊂ maintain ⊂ admin)
//   - `role_name`: the *UI* role name (read / triage / write / maintain / admin) — or a
//     custom repository role. `read`/`write` are not API permission names, so blindly
//     casting role_name produced `Unsupported GitHub permission "write"` on sync.
const ROLE_NAME_ALIASES: Record<string, GitHubCollaboratorPermission> = {
  read: 'pull',
  pull: 'pull',
  triage: 'triage',
  write: 'push',
  push: 'push',
  maintain: 'maintain',
  admin: 'admin',
}

function pickPermission(payload: GitHubCollaboratorApiPayload): GitHubCollaboratorPermission {
  // Prefer the reliable cumulative booleans; they're unambiguous and always present on
  // the list-collaborators response, including for custom roles (they reflect the base).
  const permissions = payload.permissions ?? {}
  if (permissions.admin) return 'admin'
  if (permissions.maintain) return 'maintain'
  if (permissions.push) return 'push'
  if (permissions.triage) return 'triage'
  if (permissions.pull) return 'pull'

  // Fallback for older/partial payloads: normalize role_name, defaulting an unknown
  // custom role to least privilege ('pull' → read).
  const alias = payload.role_name ? ROLE_NAME_ALIASES[payload.role_name.toLowerCase()] : undefined
  return alias ?? 'pull'
}

export function mapGitHubPermission(permission: GitHubCollaboratorPermission | string): WorkspaceMemberPermission {
  switch (permission) {
    case 'pull':
    case 'triage':
    case 'read':
      return 'read'
    case 'push':
    case 'maintain':
    case 'write':
      return 'write'
    case 'admin':
      return 'owner'
    default:
      // Unknown/custom role — fail closed to least privilege rather than crashing sync.
      return 'read'
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
    ...(collaborator.id != null ? { id: String(collaborator.id) } : {}),
    avatarUrl: collaborator.avatar_url ?? null,
  }))
}
