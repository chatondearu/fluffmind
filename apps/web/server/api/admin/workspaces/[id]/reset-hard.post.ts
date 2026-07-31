import { getDb, organization } from '@fluffmind/db'
import { ensureWorkingCopy, resetHardToRemote } from '@fluffmind/integrations'
import { eq } from 'drizzle-orm'

import { requireAdminInstance } from '../../../../utils/admin'
import { assertConfirmSlug } from '../../../../utils/admin-workspaces'
import { readJsonBody } from '../../../../utils/read-json-body'
import { rethrowVaultMutationError } from '../../../../utils/vault-mutation-error'
import { invalidateVaultIndex } from '../../../../vault/service'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from '../../../../vault/workspace'
import { withWorkspaceWriteLock } from '../../../../vault/write'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })

  const body = await readJsonBody<{ confirmSlug?: string }>(event)
  const db = getDb()
  const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, id)).limit(1)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', message: 'Workspace not found.' })
  }
  assertConfirmSlug(org.slug, body.confirmSlug)

  const config = await resolveWorkspaceConfig(id)
  if (!config.remoteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No git remote',
      message: 'Workspace has no gitRemoteUrl configured.',
    })
  }

  try {
    await withWorkspaceWriteLock(id, async () => {
      const network = await resolveWorkspaceGitNetwork(id)
      const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
      await resetHardToRemote(git, { branch: config.branch, accessToken: network.accessToken })
      invalidateVaultIndex(id)
    })
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }

  return { ok: true, workspaceId: id }
})
