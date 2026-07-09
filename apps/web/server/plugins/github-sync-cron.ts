import { getDb, workspaceGithubLink } from '@fluffmind/db'
import { syncWorkspaceMembersForOrganization } from '../utils/github-sync'

const ONE_HOUR_MS = 60 * 60 * 1000

export default defineNitroPlugin(() => {
  if (!process.env.DATABASE_URL || process.env.AUTH_DISABLED === 'true')
    return

  let running = false

  const runSync = async (): Promise<void> => {
    if (running)
      return

    running = true
    try {
      const db = getDb()
      const links = await db
        .select({
          organizationId: workspaceGithubLink.organizationId,
        })
        .from(workspaceGithubLink)

      for (const link of links) {
        try {
          await syncWorkspaceMembersForOrganization(link.organizationId)
        } catch (error) {
          console.error(`[github-sync] Workspace sync failed for ${link.organizationId}:`, error)
        }
      }
    } finally {
      running = false
    }
  }

  void runSync()
  setInterval(() => {
    void runSync()
  }, ONE_HOUR_MS)
})
