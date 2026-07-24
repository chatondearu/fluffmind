import {
  findGithubAppInstallation,
  listInstallationRepositories,
  requireAnyOwnerMembership,
} from '../../../../utils/github-installations'

export default defineEventHandler(async (event) => {
  await requireAnyOwnerMembership(event)

  const installationId = getRouterParam(event, 'installationId')
  if (!installationId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing installation id' })
  }

  const installation = await findGithubAppInstallation(installationId)
  if (!installation) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Installation not found',
      message: `No recorded GitHub App installation with id "${installationId}".`,
    })
  }

  try {
    const repositories = await listInstallationRepositories(installationId)
    return { repositories }
  } catch (error) {
    const details = error instanceof Error ? error.message : 'GitHub API call failed.'
    throw createError({
      statusCode: 502,
      statusMessage: 'GitHub repositories request failed',
      message: details,
    })
  }
})
