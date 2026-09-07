import { isAuthEnabled, requireSession } from '../utils/auth'

function isAuthRoute(path: string): boolean {
  return path === '/api/auth' || path.startsWith('/api/auth/')
}

/** Publicly reachable API routes (self-guarded or intentionally anonymous). */
function isPublicApiRoute(path: string): boolean {
  return path === '/api/health'
    || path === '/api/deployment-info'
    || path.startsWith('/api/webhooks/')
}

/**
 * Routes authenticated by an agent Bearer token (with their own session fallback where
 * applicable) inside the handler — the middleware must let them through so the handler
 * can validate the token. `/api/mcp` and the REST agent API self-authenticate.
 */
function isBearerAuthRoute(path: string): boolean {
  return path === '/api/mcp'
    || path.startsWith('/api/mcp/')
    || path.startsWith('/api/agent/')
}

export default defineEventHandler(async (event) => {
  if (!isAuthEnabled())
    return

  const path = event.path.split('?')[0] ?? event.path

  // Only guard the API surface; page and asset routes handle their own redirects.
  if (!path.startsWith('/api/'))
    return

  if (isAuthRoute(path) || isPublicApiRoute(path) || isBearerAuthRoute(path))
    return

  // Default-deny: every other /api route requires a session. Handlers still perform the
  // finer role/permission checks (admin, owner, workspace membership). This keeps a
  // newly-added endpoint protected by default instead of public until someone remembers
  // to guard it.
  await requireSession(event)
})
