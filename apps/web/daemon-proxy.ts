/**
 * Target of the portable daemon proxy (ADR-020 §2, browser reach).
 * The same-origin `/__daemon` proxy exists only for portable/solo: daemon URL set and
 * auth off. It never carries FLUFFMIND_DAEMON_TOKEN — hosted Nuxt calls the daemon
 * server-side only, so the browser never gets a route to it.
 * Evaluated per request from runtime config, so a runtime-only `NUXT_PUBLIC_*` works.
 */
/**
 * Browsers may only reach the note facade. Mesh/admin routes (vault attach, enrol tickets,
 * events) stay server-side: this proxy never carries the token, so exposing them would let
 * any page enrol a peer or attach a directory.
 */
const PROXIED_PATHS = new Set(['/health', '/v1/notes'])

export function daemonProxyTarget(
  opts: { daemonUrl: string, authEnabled: boolean },
  requestPath: string,
): string | null {
  if (opts.authEnabled || !opts.daemonUrl)
    return null
  const path = requestPath.replace(/^\/__daemon/, '')
  if (!PROXIED_PATHS.has(path.split('?')[0] ?? ''))
    return null
  return `${opts.daemonUrl.replace(/\/$/, '')}${path}`
}
