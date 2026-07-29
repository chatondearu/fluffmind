export function getInternalRedirectPath(redirectQuery: unknown): string | null {
  if (typeof redirectQuery !== 'string')
    return null
  if (!redirectQuery.startsWith('/'))
    return null
  return redirectQuery
}

export function getInvitationRedirectPath(redirectQuery: unknown): string | null {
  const redirectPath = getInternalRedirectPath(redirectQuery)
  if (!redirectPath)
    return null
  if (!redirectPath.startsWith('/accept-invitation/'))
    return null
  return redirectPath
}

export function canAccessSignup(options: {
  authPublicSignupEnabled: boolean
  redirectQuery: unknown
}): boolean {
  if (options.authPublicSignupEnabled)
    return true
  return Boolean(getInvitationRedirectPath(options.redirectQuery))
}
