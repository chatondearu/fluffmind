import { readRawBody } from 'h3'

import {
  removeGithubAppInstallation,
  unlinkWorkspacesForRemovedRepositories,
  upsertGithubAppInstallation,
} from '../../utils/github-installations'
import {
  isPushToBranch,
  verifyGithubWebhookSignature,
  type GithubInstallationPayload,
  type GithubInstallationRepositoriesPayload,
  type GithubPushPayload,
} from '../../utils/github-webhook'
import { pullWorkspaceChanges } from '../../vault/pull'
import { workspaceConfigFromEnv } from '../../vault/workspace'

function getWebhookSecret(): string | undefined {
  return process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || process.env.GITHUB_WEBHOOK_SECRET?.trim()
}

function parsePayload<T>(rawBody: string): T {
  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON payload' })
  }
}

async function handlePush(rawBody: string) {
  const payload = parsePayload<GithubPushPayload>(rawBody)

  const config = workspaceConfigFromEnv()
  const branch = config?.branch ?? process.env.GIT_BRANCH ?? 'main'
  if (!isPushToBranch(payload, branch)) {
    return { ok: true, ignored: true, reason: `ref:${payload.ref ?? 'unknown'}` }
  }

  const result = await pullWorkspaceChanges()
  return {
    ok: true,
    pulled: result.updated,
    behindBefore: result.behindBefore,
    repository: payload.repository?.full_name ?? null,
  }
}

async function handleInstallation(rawBody: string) {
  const payload = parsePayload<GithubInstallationPayload>(rawBody)
  const installationId = payload.installation?.id
  if (installationId === undefined) {
    return { ok: true, ignored: true, reason: 'installation:missing-id' }
  }

  const id = String(installationId)

  if (payload.action === 'deleted') {
    await removeGithubAppInstallation(id)
    return { ok: true, action: 'deleted', installationId: id }
  }

  if (payload.action === 'created' || payload.action === 'new_permissions_accepted' || payload.action === 'unsuspend') {
    await upsertGithubAppInstallation({
      installationId: id,
      accountLogin: payload.installation?.account?.login ?? id,
      accountType: payload.installation?.account?.type ?? 'unknown',
    })
    return { ok: true, action: payload.action, installationId: id }
  }

  return { ok: true, ignored: true, reason: `installation-action:${payload.action ?? 'unknown'}` }
}

async function handleInstallationRepositories(rawBody: string) {
  const payload = parsePayload<GithubInstallationRepositoriesPayload>(rawBody)
  const installationId = payload.installation?.id
  if (installationId === undefined || payload.action !== 'removed') {
    return { ok: true, ignored: true, reason: `installation-repositories-action:${payload.action ?? 'unknown'}` }
  }

  const removedFullNames = (payload.repositories_removed ?? [])
    .map(repo => repo.full_name)
    .filter((name): name is string => Boolean(name))

  await unlinkWorkspacesForRemovedRepositories(String(installationId), removedFullNames)
  return { ok: true, action: 'removed', installationId: String(installationId), unlinked: removedFullNames }
}

export default defineEventHandler(async (event) => {
  const secret = getWebhookSecret()
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Webhook not configured',
      message: 'Set GITHUB_APP_WEBHOOK_SECRET or GITHUB_WEBHOOK_SECRET to enable GitHub webhooks.',
    })
  }

  const signature = getHeader(event, 'x-hub-signature-256')
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty request body' })
  }

  if (!verifyGithubWebhookSignature(rawBody, signature, secret)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature' })
  }

  const eventName = getHeader(event, 'x-github-event')

  switch (eventName) {
    case 'push':
      return handlePush(rawBody)
    case 'installation':
      return handleInstallation(rawBody)
    case 'installation_repositories':
      return handleInstallationRepositories(rawBody)
    default:
      return { ok: true, ignored: true, reason: `event:${eventName ?? 'unknown'}` }
  }
})
