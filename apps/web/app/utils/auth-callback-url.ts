export function getAuthCallbackUrl(redirectQuery: unknown, defaultUrl: string): string {
  if (typeof redirectQuery !== 'string')
    return defaultUrl
  if (!redirectQuery.startsWith('/') || redirectQuery.startsWith('//'))
    return defaultUrl
  return redirectQuery
}
