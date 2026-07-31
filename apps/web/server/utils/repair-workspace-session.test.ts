import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  organization: { id: 'id' },
  session: {
    id: 'id',
    userId: 'userId',
    activeOrganizationId: 'activeOrganizationId',
  },
  member: {
    organizationId: 'organizationId',
    userId: 'userId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ __op: 'and', parts }),
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
  isNotNull: (column: unknown) => ({ __op: 'isNotNull', column }),
  notInArray: (column: unknown, values: unknown) => ({ __op: 'notInArray', column, values }),
}))

const { repairWorkspaceSession } = await import('./repair-workspace-session')

describe('repairWorkspaceSession', () => {
  beforeEach(() => {
    mocks.getDb.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clears stale active org and binds first membership', async () => {
    const clearReturning = vi.fn().mockResolvedValue([{ id: 'sess-1' }])
    const clearWhere = vi.fn().mockReturnValue({ returning: clearReturning })
    const clearSet = vi.fn().mockReturnValue({ where: clearWhere })

    const bindWhere = vi.fn().mockResolvedValue(undefined)
    const bindSet = vi.fn().mockReturnValue({ where: bindWhere })

    const update = vi.fn()
      .mockReturnValueOnce({ set: clearSet })
      .mockReturnValueOnce({ set: bindSet })

    const orgFrom = vi.fn().mockResolvedValue([{ id: 'org-alive' }])
    const sessionLimit = vi.fn().mockResolvedValue([{
      id: 'sess-1',
      activeOrganizationId: null,
    }])
    const sessionWhere = vi.fn().mockReturnValue({ limit: sessionLimit })
    const sessionFrom = vi.fn().mockReturnValue({ where: sessionWhere })

    const firstMemberLimit = vi.fn().mockResolvedValue([{ organizationId: 'org-alive' }])
    const firstMemberWhere = vi.fn().mockReturnValue({ limit: firstMemberLimit })
    const memberFrom = vi.fn().mockReturnValue({ where: firstMemberWhere })

    const select = vi.fn()
      .mockReturnValueOnce({ from: orgFrom })
      .mockReturnValueOnce({ from: sessionFrom })
      .mockReturnValueOnce({ from: memberFrom })

    mocks.getDb.mockReturnValue({ select, update })

    const result = await repairWorkspaceSession({
      userId: 'user-1',
      sessionId: 'sess-1',
    })

    expect(result).toEqual({ workspaceId: 'org-alive', repaired: true })
    expect(clearSet).toHaveBeenCalledWith({ activeOrganizationId: null })
    expect(bindSet).toHaveBeenCalledWith({ activeOrganizationId: 'org-alive' })
  })

  it('returns unrepaired when active org membership is already valid', async () => {
    const clearReturning = vi.fn().mockResolvedValue([])
    const clearWhere = vi.fn().mockReturnValue({ returning: clearReturning })
    const clearSet = vi.fn().mockReturnValue({ where: clearWhere })
    const update = vi.fn().mockReturnValue({ set: clearSet })

    const orgFrom = vi.fn().mockResolvedValue([{ id: 'org-1' }])
    const sessionLimit = vi.fn().mockResolvedValue([{
      id: 'sess-1',
      activeOrganizationId: 'org-1',
    }])
    const sessionWhere = vi.fn().mockReturnValue({ limit: sessionLimit })
    const sessionFrom = vi.fn().mockReturnValue({ where: sessionWhere })

    const memberLimit = vi.fn().mockResolvedValue([{ organizationId: 'org-1' }])
    const memberWhere = vi.fn().mockReturnValue({ limit: memberLimit })
    const memberFrom = vi.fn().mockReturnValue({ where: memberWhere })

    const select = vi.fn()
      .mockReturnValueOnce({ from: orgFrom })
      .mockReturnValueOnce({ from: sessionFrom })
      .mockReturnValueOnce({ from: memberFrom })

    mocks.getDb.mockReturnValue({ select, update })

    const result = await repairWorkspaceSession({
      userId: 'user-1',
      sessionId: 'sess-1',
    })

    expect(result).toEqual({ workspaceId: 'org-1', repaired: false })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('returns null workspace when user has no memberships', async () => {
    const clearReturning = vi.fn().mockResolvedValue([{ id: 'sess-1' }])
    const clearWhere = vi.fn().mockReturnValue({ returning: clearReturning })
    const clearSet = vi.fn().mockReturnValue({ where: clearWhere })
    const update = vi.fn().mockReturnValue({ set: clearSet })

    const orgFrom = vi.fn().mockResolvedValue([])
    const sessionLimit = vi.fn().mockResolvedValue([{
      id: 'sess-1',
      activeOrganizationId: null,
    }])
    const sessionWhere = vi.fn().mockReturnValue({ limit: sessionLimit })
    const sessionFrom = vi.fn().mockReturnValue({ where: sessionWhere })

    const memberLimit = vi.fn().mockResolvedValue([])
    const memberWhere = vi.fn().mockReturnValue({ limit: memberLimit })
    const memberFrom = vi.fn().mockReturnValue({ where: memberWhere })

    const select = vi.fn()
      .mockReturnValueOnce({ from: orgFrom })
      .mockReturnValueOnce({ from: sessionFrom })
      .mockReturnValueOnce({ from: memberFrom })

    mocks.getDb.mockReturnValue({ select, update })

    const result = await repairWorkspaceSession({
      userId: 'user-1',
      sessionId: 'sess-1',
    })

    expect(result).toEqual({ workspaceId: null, repaired: true })
  })
})
