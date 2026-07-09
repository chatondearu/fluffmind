import { createHmac, timingSafeEqual } from 'node:crypto'

/** Verify GitHub webhook `X-Hub-Signature-256` header against the raw request body. */
export function verifyGithubWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signatureHeader)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export interface GithubPushPayload {
  ref?: string
  repository?: {
    full_name?: string
  }
}

export function isPushToBranch(payload: GithubPushPayload, branch: string): boolean {
  return payload.ref === `refs/heads/${branch}`
}
