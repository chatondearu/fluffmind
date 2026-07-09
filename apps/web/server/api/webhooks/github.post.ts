import { readRawBody } from 'h3'

import { isPushToBranch, verifyGithubWebhookSignature, type GithubPushPayload } from '../../utils/github-webhook'
import { pullWorkspaceChanges } from '../../vault/pull'
import { workspaceConfigFromEnv } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Webhook not configured',
      message: 'Set GITHUB_WEBHOOK_SECRET to enable GitHub webhooks.',
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
  if (eventName !== 'push') {
    return { ok: true, ignored: true, reason: `event:${eventName ?? 'unknown'}` }
  }

  let payload: GithubPushPayload
  try {
    payload = JSON.parse(rawBody) as GithubPushPayload
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON payload' })
  }

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
})
