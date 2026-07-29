import { canAccessSignup } from '../utils/signup-access'

const PUBLIC_ROUTES = new Set(['/login'])
const PUBLIC_ROUTE_PREFIXES = ['/accept-invitation/']

export default defineNuxtRouteMiddleware(async (to) => {
  const { public: { authEnabled, authPublicSignupEnabled } } = useRuntimeConfig()

  if (!authEnabled)
    return

  if (PUBLIC_ROUTES.has(to.path))
    return

  if (PUBLIC_ROUTE_PREFIXES.some(prefix => to.path.startsWith(prefix)))
    return

  if (to.path === '/signup') {
    const allowed = canAccessSignup({
      authPublicSignupEnabled,
      redirectQuery: to.query.redirect,
    })

    if (!allowed)
      return navigateTo(`/login?redirect=${encodeURIComponent('/')}&reason=invite-only`)

    return
  }

  const { authClient } = await import('../composables/useAuth')
  const session = await authClient.getSession()

  if (!session.data?.session)
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}&reason=auth-required`)
})
