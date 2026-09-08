import { requireGithubAppListAccess } from '../../../utils/github-installations'

export default defineEventHandler(async (event) => {
  await requireGithubAppListAccess(event)

  const slug = process.env.GITHUB_APP_SLUG?.trim()
  if (!slug) {
    throw createError({
      statusCode: 503,
      statusMessage: 'GitHub App not configured',
      message: 'Set GITHUB_APP_SLUG to enable the GitHub App install flow.',
    })
  }

  return { url: `https://github.com/apps/${slug}/installations/new` }
})
