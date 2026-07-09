import { authClient } from '../composables/useAuth'

const PUBLIC_ROUTES = new Set(['/login', '/signup'])

export default defineNuxtRouteMiddleware(async (to) => {
  const { public: { authEnabled } } = useRuntimeConfig()

  if (!authEnabled)
    return

  if (PUBLIC_ROUTES.has(to.path))
    return

  const session = await authClient.getSession()

  if (!session.data?.session)
    return navigateTo('/login')
})
