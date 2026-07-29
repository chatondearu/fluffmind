// Client-safe subpath: the @fluffmind/db barrel also re-exports pg-backed client.ts,
// and Vite SSR inlining of pg hits TDZ ("Cannot access 'pg' before initialization").
import { ac, roles } from '@fluffmind/db/permissions'
import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

/**
 * Absolute origin for Better Auth client calls during SSR.
 * Relative `/api/auth/...` paths break Node fetch ("Failed to parse URL").
 */
function resolveAuthOrigin(): string | undefined {
  if (import.meta.client)
    return undefined

  const configured = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL
  if (configured)
    return configured.replace(/\/+$/, '')

  const port = process.env.NUXT_PORT || process.env.NITRO_PORT || process.env.PORT || '3000'
  return `http://127.0.0.1:${port}`
}

export const authClient = createAuthClient({
  baseURL: resolveAuthOrigin(),
  plugins: [organizationClient({ ac, roles })],
})

/**
 * Prefer Nuxt fetch resolution on the server so relative auth paths are bound
 * to the incoming request origin (and cookies are forwarded).
 */
export function useAuth() {
  if (!import.meta.server)
    return authClient.useSession(useFetch)

  const origin = useRequestURL().origin
  const headers = useRequestHeaders(['cookie'])

  return authClient.useSession((request, opts) => {
    const path = typeof request === 'string' ? request : String(request)
    const url = path.startsWith('http')
      ? path
      : `${origin}${path.startsWith('/') ? path : `/${path}`}`

    return useFetch(url, {
      ...(opts as Record<string, unknown>),
      headers: {
        ...headers,
        ...((opts as { headers?: Record<string, string> } | undefined)?.headers),
      },
      credentials: 'include',
    })
  })
}
