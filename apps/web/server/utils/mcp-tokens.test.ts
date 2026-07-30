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
    mcpEnabled: 'mcpEnabled',
  },
  workspaceMcpToken: {
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
  extractMcpBearerToken,
  generateMcpTokenPlaintext,
  hashMcpToken,
  resolveMcpBearerAuth,
} from './mcp-tokens'

describe('mcp-tokens helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('hashes stably', () => {
    expect(hashMcpToken('fm_mcp_ab_cd')).toBe(hashMcpToken('fm_mcp_ab_cd'))
    expect(hashMcpToken('a')).not.toBe(hashMcpToken('b'))
  })

  it('generates fm_mcp_ prefix tokens', () => {
    const { token, tokenPrefix } = generateMcpTokenPlaintext()
    expect(token).toMatch(/^fm_mcp_[a-f0-9]{8}_[a-f0-9]+$/)
    expect(token).toContain(tokenPrefix)
  })

  it('extracts Bearer MCP tokens only', () => {
    expect(extractMcpBearerToken('Bearer fm_mcp_aa_bb')).toBe('fm_mcp_aa_bb')
    expect(extractMcpBearerToken('Bearer other')).toBeNull()
    expect(extractMcpBearerToken(undefined)).toBeNull()
  })

  it('resolveMcpBearerAuth rejects revoked tokens', async () => {
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
                mcpEnabled: true,
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

    await expect(resolveMcpBearerAuth('fm_mcp_aa_bb')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('resolveMcpBearerAuth rejects when MCP disabled', async () => {
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
                mcpEnabled: false,
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

    await expect(resolveMcpBearerAuth('fm_mcp_aa_bb')).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  })

  it('resolveMcpBearerAuth returns workspace and scope', async () => {
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
                mcpEnabled: true,
              }]),
            }),
          }),
        }),
      }),
      update,
    })

    await expect(resolveMcpBearerAuth('fm_mcp_aa_bb')).resolves.toEqual({
      workspaceId: 'org_1',
      scope: 'read',
      tokenId: 'tok_1',
    })
    expect(updateSet).toHaveBeenCalled()
  })
})
