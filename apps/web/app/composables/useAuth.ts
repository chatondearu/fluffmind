// Client-safe subpath: the @fluffmind/db barrel also re-exports pg-backed client.ts,
// and Vite SSR inlining of pg hits TDZ ("Cannot access 'pg' before initialization").
import { ac, roles } from '@fluffmind/db/permissions'
import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
})

export function useAuth() {
  return authClient.useSession(useFetch)
}
