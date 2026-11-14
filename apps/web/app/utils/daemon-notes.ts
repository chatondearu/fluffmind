/**
 * Pure helpers for the portable daemon HTTP client (AUTH_DISABLED + daemonUrl).
 */

/** Same-origin Nitro proxy prefix (see nuxt.config routeRules). Avoids browser CORS. */
export const DAEMON_PROXY_PREFIX = '/__daemon'

export function normalizeDaemonBaseUrl(raw: string | undefined | null): string {
  return String(raw ?? '').trim().replace(/\/+$/, '')
}

/** Prefer daemon writes only in auth-off solo when a daemon base URL is configured. */
export function shouldPreferDaemon(opts: {
  authEnabled: boolean
  daemonUrl: string | undefined | null
}): boolean {
  return !opts.authEnabled && Boolean(normalizeDaemonBaseUrl(opts.daemonUrl))
}

/**
 * Browser HTTP base: same-origin `/__daemon` when portable mode is on.
 * Nitro proxies to NUXT_PUBLIC_DAEMON_URL (default 127.0.0.1:8787).
 */
export function daemonClientBase(configuredUrl: string | undefined | null): string {
  return shouldPreferDaemon({ authEnabled: false, daemonUrl: configuredUrl })
    ? DAEMON_PROXY_PREFIX
    : ''
}

export function daemonHealthUrl(base: string): string {
  return `${normalizeDaemonBaseUrl(base)}/health`
}

export function daemonNotesUrl(base: string): string {
  return `${normalizeDaemonBaseUrl(base)}/v1/notes`
}

export function daemonNoteGetUrl(
  base: string,
  id: string,
  writer?: string,
): string {
  const qs = new URLSearchParams({ id })
  if (writer?.trim())
    qs.set('writer', writer.trim())
  return `${daemonNotesUrl(base)}?${qs.toString()}`
}
