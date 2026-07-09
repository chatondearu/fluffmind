const PUBLIC_ROUTES = new Set(['/login', '/signup'])
const PUBLIC_ROUTE_PREFIXES = ['/accept-invitation/']

export default defineNuxtRouteMiddleware(async (to) => {
  const { public: { authEnabled } } = useRuntimeConfig()

  if (!authEnabled)
    return

  if (PUBLIC_ROUTES.has(to.path))
    return

  if (PUBLIC_ROUTE_PREFIXES.some(prefix => to.path.startsWith(prefix)))
    return

  const { authClient } = await import('../composables/useAuth')
  const session = await authClient.getSession()

  if (!session.data?.session)
    return navigateTo('/login')
})
