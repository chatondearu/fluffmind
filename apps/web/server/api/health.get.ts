import { isAuthEnabled } from '../utils/auth'
import { workspaceConfigFromEnv } from '../vault/workspace'

export default defineEventHandler((event) => {
  const vaultConfigured = Boolean(workspaceConfigFromEnv()) || isAuthEnabled()

  setResponseStatus(event, vaultConfigured ? 200 : 503)
  return {
    status: vaultConfigured ? 'ok' : 'error',
    authEnabled: isAuthEnabled(),
  }
})
