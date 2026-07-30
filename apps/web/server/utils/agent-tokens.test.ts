import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  organization: {
    id: 'id',
    name: 'name',
    slug: 'slug',
  },
  workspaceConfig: {
    organizationId: 'organizationId',
    agentEnabled: 'agentEnabled',
  },
  workspaceAgentToken: {
    id: 'id',
    organizationId: 'organizationId',
    name: 'name',
    scope: 'scope',
    tokenPrefix: 'tokenPrefix',
    tokenHash: 'tokenHash',
    createdByUserId: 'createdByUserId',
    createdAt: 'createdAt',
    lastUsedAt: 'lastUsedAt',
    revokedAt: 'revokedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
  and: (...conditions: unknown[]) => ({ __op: 'and', conditions }),
  isNull: (column: unknown) => ({ __op: 'isNull', column }),
}))

import {
  extractAgentBearerToken,
  generateAgentTokenPlaintext,
  hashAgentToken,
  resolveAgentBearerAuth,
} from './agent-tokens'

describe('agent-tokens', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('generates fm_agent_ tokens', () => {
    const { token, tokenPrefix } = generateAgentTokenPlaintext()
    expect(token).toMatch(/^fm_agent_[a-f0-9]{8}_[a-f0-9]+$/)
    expect(token).toContain(tokenPrefix)
  })

  it('extracts fm_agent_ and legacy fm_mcp_ Bearer tokens', () => {
    expect(extractAgentBearerToken('Bearer fm_agent_aa_bb')).toBe('fm_agent_aa_bb')
    expect(extractAgentBearerToken('Bearer fm_mcp_aa_bb')).toBe('fm_mcp_aa_bb')
    expect(extractAgentBearerToken('Bearer other')).toBeNull()
    expect(extractAgentBearerToken(undefined)).toBeNull()
  })

  it('hashes stably', () => {
    expect(hashAgentToken('fm_agent_x')).toBe(hashAgentToken('fm_agent_x'))
    expect(hashAgentToken('a')).not.toBe(hashAgentToken('b'))
  })

  it('resolveAgentBearerAuth rejects revoked tokens', async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: 'tok_1',
                organizationId: 'org_1',
                scope: 'write',
                revokedAt: new Date(),
                agentEnabled: true,
              }]),
            }),
          }),
        }),
      }),
    })

    vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string, message: string }) => {
      const error = new Error(options.message) as Error & { statusCode: number, statusMessage: string }
      error.statusCode = options.statusCode
      error.statusMessage = options.statusMessage
      return error
    })

    await expect(resolveAgentBearerAuth('fm_agent_aa_bb')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('resolveAgentBearerAuth rejects when agent access disabled', async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: 'tok_1',
                organizationId: 'org_1',
                scope: 'read',
                revokedAt: null,
                agentEnabled: false,
              }]),
            }),
          }),
        }),
      }),
    })

    vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string, message: string }) => {
      const error = new Error(options.message) as Error & { statusCode: number, statusMessage: string }
      error.statusCode = options.statusCode
      error.statusMessage = options.statusMessage
      return error
    })

    await expect(resolveAgentBearerAuth('fm_agent_aa_bb')).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  })

  it('resolveAgentBearerAuth returns workspace and scope', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set: updateSet })

    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: 'tok_1',
                organizationId: 'org_1',
                scope: 'read',
                revokedAt: null,
                agentEnabled: true,
              }]),
            }),
          }),
        }),
      }),
      update,
    })

    await expect(resolveAgentBearerAuth('fm_agent_aa_bb')).resolves.toEqual({
      workspaceId: 'org_1',
      scope: 'read',
      tokenId: 'tok_1',
    })
    expect(updateSet).toHaveBeenCalled()

    // Legacy fm_mcp_ plaintext must resolve identically (same hash-based lookup).
    await expect(resolveAgentBearerAuth('fm_mcp_aa_bb')).resolves.toEqual({
      workspaceId: 'org_1',
      scope: 'read',
      tokenId: 'tok_1',
    })
  })
})
