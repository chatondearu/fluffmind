import { bootstrapWorkspace } from '../vault/sync'

export default defineNitroPlugin(() => {
  bootstrapWorkspace().catch((error: unknown) => {
    console.error('[vault] Failed to bootstrap workspace at server start:', error)
  })
})
