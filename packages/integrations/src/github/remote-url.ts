export function buildGitHubHttpsRemoteUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`
}

export function withGitHubAccessToken(remoteUrl: string, token: string): string {
  const url = new URL(remoteUrl)
  url.username = 'x-access-token'
  url.password = token
  return url.toString()
}
