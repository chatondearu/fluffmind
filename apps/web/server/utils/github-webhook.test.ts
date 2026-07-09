import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { isPushToBranch, verifyGithubWebhookSignature } from './github-webhook'

describe('github-webhook', () => {
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
})
