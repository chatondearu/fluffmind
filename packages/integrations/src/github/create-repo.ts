export type GithubAccountType = 'Organization' | 'User'

export interface CreateGithubRepositoryInput {
  token: string
  accountLogin: string
  accountType: GithubAccountType
  name: string
  private?: boolean
  /** When true, GitHub seeds a README commit. Default false to avoid diverging from local vault history. */
  autoInit?: boolean
  fetchImpl?: typeof fetch
}

export interface CreatedGithubRepository {
  owner: string
  repo: string
  htmlUrl: string
  cloneUrl: string
}

export class GithubApiError extends Error {
  readonly status: number
  readonly githubMessage: string

  constructor(status: number, githubMessage: string) {
    super(`GitHub repository create failed (${status}): ${githubMessage}`)
    this.name = 'GithubApiError'
    this.status = status
    this.githubMessage = githubMessage
  }
}

interface CreateRepoApiPayload {
  name: string
  html_url: string
  clone_url: string
  owner: { login: string }
}

export async function createGithubRepository(
  input: CreateGithubRepositoryInput,
): Promise<CreatedGithubRepository> {
  const fetchImpl = input.fetchImpl ?? fetch
  const isOrg = input.accountType === 'Organization'
  const url = isOrg
    ? `https://api.github.com/orgs/${encodeURIComponent(input.accountLogin)}/repos`
    : 'https://api.github.com/user/repos'

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${input.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fluffmind-integrations',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      private: input.private ?? true,
      // Default false: an auto-init README on GitHub conflicts with local vault
      // history (e.g. welcome.md) on the first push/rebase.
      auto_init: input.autoInit ?? false,
    }),
  })

  if (!response.ok) {
    let githubMessage = 'Unknown error'
    try {
      const body = await response.json() as { message?: string }
      if (body.message)
        githubMessage = body.message
    }
    catch {
      // keep default
    }
    throw new GithubApiError(response.status, githubMessage)
  }

  const data = await response.json() as CreateRepoApiPayload
  return {
    owner: data.owner.login,
    repo: data.name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
  }
}
