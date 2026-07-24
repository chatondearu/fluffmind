import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const TOKEN_PREFIX = 'enc:v1:'

function getTokenSecret(): string {
  // TODO(P6): use dedicated key management for secrets at rest.
  return process.env.GITHUB_SYNC_TOKEN_SECRET?.trim()
    || process.env.NUXT_SESSION_PASSWORD?.trim()
    || 'fluffmind-dev-token-secret'
}

function getTokenKey(): Buffer {
  return createHash('sha256').update(getTokenSecret(), 'utf8').digest()
}

function parseEncryptedTokenParts(value: string): { iv: Buffer, authTag: Buffer, payload: Buffer } | null {
  if (!value.startsWith(TOKEN_PREFIX))
    return null

  const [ivBase64, authTagBase64, payloadBase64] = value.slice(TOKEN_PREFIX.length).split('.')
  if (!ivBase64 || !authTagBase64 || !payloadBase64)
    return null

  return {
    iv: Buffer.from(ivBase64, 'base64url'),
    authTag: Buffer.from(authTagBase64, 'base64url'),
    payload: Buffer.from(payloadBase64, 'base64url'),
  }
}

export function encryptSyncToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getTokenKey(), iv)
  const payload = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${TOKEN_PREFIX}${iv.toString('base64url')}.${authTag.toString('base64url')}.${payload.toString('base64url')}`
}

export function decryptSyncToken(encryptedToken: string): string {
  const encrypted = parseEncryptedTokenParts(encryptedToken)
  if (!encrypted)
    return encryptedToken

  const decipher = createDecipheriv('aes-256-gcm', getTokenKey(), encrypted.iv)
  decipher.setAuthTag(encrypted.authTag)
  const payload = Buffer.concat([decipher.update(encrypted.payload), decipher.final()])
  return payload.toString('utf8')
}
