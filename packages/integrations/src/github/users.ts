const LOGIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i

export function normalizeGitHubLogin(input: string): string | null {
  const trimmed = input.trim().replace(/^@+/, '')
  if (!trimmed || !LOGIN_RE.test(trimmed))
    return null
  return trimmed.toLowerCase()
}

export interface ResolvedGitHubUser {
  id: string
  login: string
  avatarUrl: string | null
  email: string | null
}

export async function resolveGitHubUser(token: string, login: string): Promise<ResolvedGitHubUser | null> {
  const normalized = normalizeGitHubLogin(login)
  if (!normalized)
    return null

  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(normalized)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fluffmind-integrations',
    },
  })

  if (response.status === 404)
    return null
  if (!response.ok)
    throw new Error(`GitHub user lookup failed (${response.status})`)

  const data = await response.json() as { id: number, login: string, avatar_url?: string, email?: string | null }
  return {
    id: String(data.id),
    login: data.login.toLowerCase(),
    avatarUrl: data.avatar_url ?? null,
    email: typeof data.email === 'string' && data.email.trim() ? data.email.trim().toLowerCase() : null,
  }
}
