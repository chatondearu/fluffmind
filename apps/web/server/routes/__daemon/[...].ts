import { daemonProxyTarget } from '../../../daemon-proxy'

// Portable/solo only; decided per request so runtime env overrides are honoured.
export default defineEventHandler((event) => {
  const { daemonUrl, authEnabled } = useRuntimeConfig(event).public
  const target = daemonProxyTarget(
    { daemonUrl: String(daemonUrl || ''), authEnabled: Boolean(authEnabled) },
    event.path,
  )
  if (!target)
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  return proxyRequest(event, target)
})
