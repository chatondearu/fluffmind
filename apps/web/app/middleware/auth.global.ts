import { canAccessSignup } from '../utils/signup-access'

const PUBLIC_ROUTES = new Set(['/login'])
const PUBLIC_ROUTE_PREFIXES = ['/accept-invitation/']

type SessionPayload = {
  session?: { id?: string } | null
} | null

async function hasActiveSession(): Promise<boolean> {
  // On the server, never use authClient.getSession() — its relative fetch URL
  // throws "Failed to parse URL from /api/auth/get-session" under Node.
  if (import.meta.server) {
    const headers = useRequestHeaders(['cookie'])
    try {
      const data = await $fetch<SessionPayload>('/api/auth/get-session', {
        headers,
      })
      return Boolean(data?.session)
    } catch {
      return false
    }
  }

  const { authClient } = await import('../composables/useAuth')
  const session = await authClient.getSession()
  return Boolean(session.data?.session)
}

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

  if (!(await hasActiveSession()))
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}&reason=auth-required`)
})
