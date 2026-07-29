/**
 * Resolve the email Better Auth should store for a GitHub OAuth profile.
 * GitHub may return `email: null` when the user hides their address or when the
 * GitHub App lacks "Email addresses: Read-only". Better Auth still requires a
 * non-empty email, so we fall back to GitHub's noreply form.
 */
export function buildGithubNoreplyEmail(input: { id: string, login: string }): string {
  const id = input.id.trim()
  const login = input.login.trim().toLowerCase()
  if (!id || !login)
    throw new Error('GitHub noreply email requires id and login.')
  return `${id}+${login}@users.noreply.github.com`
}

export function resolveGithubAuthEmail(profile: {
  id?: string | number | null
  login?: string | null
  email?: string | null
}): string {
  const fromProfile = typeof profile.email === 'string' ? profile.email.trim() : ''
  if (fromProfile)
    return fromProfile.toLowerCase()

  const id = profile.id == null ? '' : String(profile.id).trim()
  const login = typeof profile.login === 'string' ? profile.login.trim().toLowerCase() : ''

  if (id && login)
    return buildGithubNoreplyEmail({ id, login })
  if (login)
    return `${login}@users.noreply.github.com`
  if (id)
    return `${id}@users.noreply.github.com`

  throw new Error('GitHub profile is missing id, login, and email.')
}
