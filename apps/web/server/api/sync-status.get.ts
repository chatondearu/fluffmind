import { getWorkspaceSyncStatus } from '../vault/sync'

export default defineEventHandler(async () => {
  const status = await getWorkspaceSyncStatus()
  if (!status) {
    throw createError({ statusCode: 503, statusMessage: 'VAULT_PATH is not configured' })
  }
  return status
})
