import { ac, roles } from '@fluffmind/db'
import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
})

export function useAuth() {
  return authClient.useSession(useFetch)
}
