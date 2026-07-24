import { getGitHubAppCredentials } from '../../../utils/github-credentials'
import {
  requireAnyOwnerMembership,
  resolveInstallationAccountInfo,
  upsertGithubAppInstallation,
} from '../../../utils/github-installations'

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

/**
 * GitHub redirects the owner's browser here after installing/updating the App
 * ("Setup URL"). Records the installation eagerly so self-hosted instances without a
 * public webhook endpoint still get a usable installation — the `installation`
 * webhook (when configured) keeps account details fresh afterwards.
 */
export default defineEventHandler(async (event) => {
  await requireAnyOwnerMembership(event)

  if (!getGitHubAppCredentials()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'GitHub App not configured',
      message: 'GitHub App credentials are not configured.',
    })
  }

  const query = getQuery(event)
  const installationId = firstQueryValue(query.installation_id)
  const setupAction = firstQueryValue(query.setup_action)

  if (!installationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing installation_id',
      message: 'GitHub did not provide an installation_id on the callback.',
    })
  }

  let accountLogin = installationId
  let accountType = 'unknown'

  try {
    const accountInfo = await resolveInstallationAccountInfo(installationId)
    if (accountInfo) {
      accountLogin = accountInfo.accountLogin
      accountType = accountInfo.accountType
    }
  } catch {
    // No accessible repositories yet (or a transient API error) — the row is still
    // recorded with a placeholder; the `installation` webhook backfills it later.
  }

  await upsertGithubAppInstallation({ installationId, accountLogin, accountType })

  const redirectQuery = new URLSearchParams({ installationId })
  if (setupAction)
    redirectQuery.set('setupAction', setupAction)

  return sendRedirect(event, `/settings/workspace?${redirectQuery.toString()}`)
})
