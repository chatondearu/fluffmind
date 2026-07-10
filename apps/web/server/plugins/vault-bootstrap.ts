import { isAuthEnabled } from '../utils/auth'
import { bootstrapWorkspace } from '../vault/sync'

export default defineNitroPlugin(() => {
  if (isAuthEnabled()) return

  bootstrapWorkspace('default').catch((error: unknown) => {
    console.error('[vault] Failed to bootstrap workspace at server start:', error)
  })
})
