interface GitHubOrgMemberApiPayload {
  id: number
  login: string
  avatar_url?: string | null
}

export async function fetchOrgMembers(token: string, org: string) {
  const response = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/members?per_page=100`, {
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

    throw new Error(`GitHub org members request failed (${response.status})${details}`)
  }

  const data = await response.json() as GitHubOrgMemberApiPayload[]

  return data.map(member => ({
    login: member.login,
    id: String(member.id),
    avatarUrl: member.avatar_url ?? null,
    source: 'org_member' as const,
  }))
}
