import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  extractAgentBearerToken: vi.fn(),
  resolveAgentBearerAuth: vi.fn(),
}))

vi.mock('./agent-tokens', () => ({
  extractAgentBearerToken: mocks.extractAgentBearerToken,
  resolveAgentBearerAuth: mocks.resolveAgentBearerAuth,
}))

// Vitest mock must be configured before importing the module under test.
// eslint-disable-next-line import/first
import { assertAgentWriteScope, requireAgentBearer } from './agent-auth'

const event = { headers: new Headers({ authorization: 'Bearer fm_agent_x' }) } as unknown as H3Event

function stubCreateError() {
  vi.stubGlobal('createError', (options: {
    statusCode: number
    statusMessage: string
    message: string
  }) => Object.assign(new Error(options.message), options))
}

describe('requireAgentBearer', () => {
  beforeEach(() => {
    stubCreateError()
    vi.stubGlobal('getHeader', (_evt: unknown, name: string) =>
      name === 'authorization' ? 'Bearer fm_agent_x' : undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects with 401 when no Bearer token is present', async () => {
    mocks.extractAgentBearerToken.mockReturnValue(null)

    await expect(requireAgentBearer(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.resolveAgentBearerAuth).not.toHaveBeenCalled()
  })

  it('resolves workspace, scope, and tokenId for a valid token', async () => {
    mocks.extractAgentBearerToken.mockReturnValue('fm_agent_x')
    mocks.resolveAgentBearerAuth.mockResolvedValue({
      workspaceId: 'org_1',
      scope: 'write',
      tokenId: 'tok_1',
    })

    await expect(requireAgentBearer(event)).resolves.toEqual({
      workspaceId: 'org_1',
      scope: 'write',
      tokenId: 'tok_1',
    })
    expect(mocks.resolveAgentBearerAuth).toHaveBeenCalledWith('fm_agent_x')
  })

  it('propagates errors raised by resolveAgentBearerAuth (revoked/disabled tokens)', async () => {
    mocks.extractAgentBearerToken.mockReturnValue('fm_agent_x')
    mocks.resolveAgentBearerAuth.mockRejectedValue(Object.assign(new Error('Invalid or revoked agent token.'), { statusCode: 401 }))

    await expect(requireAgentBearer(event)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('assertAgentWriteScope', () => {
  beforeEach(() => {
    stubCreateError()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allows write-scoped tokens', () => {
    expect(() => assertAgentWriteScope('write')).not.toThrow()
  })

  it('rejects read-scoped tokens with 403', () => {
    expect(() => assertAgentWriteScope('read')).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })
})
