/**
 * Target of the portable daemon proxy (ADR-020 §2, browser reach).
 * The same-origin `/__daemon` proxy exists only for portable/solo: daemon URL set and
 * auth off. It never carries FLUFFMIND_DAEMON_TOKEN — hosted Nuxt calls the daemon
 * server-side only, so the browser never gets a route to it.
 * Evaluated per request from runtime config, so a runtime-only `NUXT_PUBLIC_*` works.
 */
export function daemonProxyTarget(
  opts: { daemonUrl: string, authEnabled: boolean },
  requestPath: string,
): string | null {
  if (opts.authEnabled || !opts.daemonUrl)
    return null
  return `${opts.daemonUrl.replace(/\/$/, '')}${requestPath.replace(/^\/__daemon/, '')}`
}
