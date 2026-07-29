import { isAuthEnabled } from '../utils/auth'

/**
 * Keep public runtimeConfig in sync with live process env.
 * Nuxt only auto-overrides public keys via NUXT_PUBLIC_*; AUTH_DISABLED /
 * DATABASE_URL alone would leave a stale build-time `authEnabled: false` and
 * skip the client route middleware while APIs still enforce auth.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const config = useRuntimeConfig(event)
    config.public.authEnabled = isAuthEnabled()
    config.public.authPublicSignupEnabled = process.env.AUTH_PUBLIC_SIGNUP === 'true'
    config.public.githubOAuthEnabled = Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
    )
  })
})
