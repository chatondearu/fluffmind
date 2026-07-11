import { isAuthEnabled, requireSession } from '../utils/auth'

function isAuthRoute(path: string): boolean {
  return path === '/api/auth' || path.startsWith('/api/auth/')
}

function isPublicApiRoute(path: string): boolean {
  return path === '/api/health' || path === '/api/deployment-info' || path.startsWith('/api/webhooks/')
}

function isProtectedRoute(path: string): boolean {
  if (path === '/api/notes' || path.startsWith('/api/notes/'))
    return true

  return path === '/api/graph' || path === '/api/sync-status' || path === '/api/mcp' || path === '/api/sync/pull'
}

export default defineEventHandler(async (event) => {
  if (!isAuthEnabled())
    return

  const path = event.path

  if (isAuthRoute(path))
    return

  if (isPublicApiRoute(path))
    return

  if (!isProtectedRoute(path))
    return

  await requireSession(event)
})
