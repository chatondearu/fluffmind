/**
 * Nitro route rules for the portable daemon (ADR-020 §2, browser reach).
 * The same-origin `/__daemon` proxy exists only for portable/solo: daemon URL set and
 * auth off. It never carries FLUFFMIND_DAEMON_TOKEN — hosted Nuxt calls the daemon
 * server-side only, so the browser never gets a route to it.
 */
export function daemonProxyRules(opts: { daemonUrl: string, authEnabled: boolean }): Record<string, { proxy: string }> {
  if (opts.authEnabled || !opts.daemonUrl)
    return {}
  return { '/__daemon/**': { proxy: `${opts.daemonUrl.replace(/\/$/, '')}/**` } }
}
