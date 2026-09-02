import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  member: {
    id: 'id',
    organizationId: 'organizationId',
    userId: 'userId',
  },
  memberSyncMeta: {
    memberId: 'memberId',
    source: 'source',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
}))

const { pinWorkspaceCreatorAsManual } = await import('./pin-workspace-creator')

describe('pinWorkspaceCreatorAsManual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts member_sync_meta source=manual for the creator membership', async () => {
    const limit = vi.fn().mockResolvedValue([{ id: 'member-1' }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values })

    mocks.getDb.mockReturnValue({ select, insert })

    await pinWorkspaceCreatorAsManual('org-1', 'user-1')

    expect(values).toHaveBeenCalledWith({
      memberId: 'member-1',
      source: 'manual',
      localOverride: false,
    })
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: 'memberId',
      set: { source: 'manual' },
    })
  })

  it('no-ops when membership is missing', async () => {
    const limit = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const insert = vi.fn()
    mocks.getDb.mockReturnValue({ select, insert })

    await pinWorkspaceCreatorAsManual('org-1', 'user-1')
    expect(insert).not.toHaveBeenCalled()
  })
})
