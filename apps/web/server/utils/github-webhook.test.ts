import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'

import { getWebhookSecret, isPushToBranch, verifyGithubWebhookSignature } from './github-webhook'

describe('github-webhook', () => {
  afterEach(() => {
    delete process.env.GITHUB_APP_WEBHOOK_SECRET
    delete process.env.GITHUB_WEBHOOK_SECRET
  })

  it('verifies valid sha256 signatures', () => {
    const body = '{"ref":"refs/heads/main"}'
    const secret = 'test-secret'
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

    expect(verifyGithubWebhookSignature(body, signature, secret)).toBe(true)
  })

  it('rejects invalid signatures', () => {
    expect(verifyGithubWebhookSignature('{}', 'sha256=deadbeef', 'secret')).toBe(false)
  })

  it('matches push ref to branch', () => {
    expect(isPushToBranch({ ref: 'refs/heads/main' }, 'main')).toBe(true)
    expect(isPushToBranch({ ref: 'refs/heads/dev' }, 'main')).toBe(false)
  })

  it('prefers the GitHub App webhook secret and falls back to the legacy secret', () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'legacy-secret'
    expect(getWebhookSecret()).toBe('legacy-secret')

    process.env.GITHUB_APP_WEBHOOK_SECRET = 'app-secret'
    expect(getWebhookSecret()).toBe('app-secret')
  })
})
