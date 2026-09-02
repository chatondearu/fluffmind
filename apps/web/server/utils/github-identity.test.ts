import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  account: {
    userId: 'userId',
    providerId: 'providerId',
    accountId: 'accountId',
  },
  user: {
    id: 'id',
    name: 'name',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
  or: (...args: unknown[]) => ({ __op: 'or', args }),
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }), {
    raw: (value: string) => value,
  }),
}))

const { resolveUserIdByGithubIdentity } = await import('./github-identity')

describe('resolveUserIdByGithubIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('matches numeric GitHub accountId even when login differs', async () => {
    const limit = vi.fn().mockResolvedValue([{ userId: 'user-1' }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    mocks.getDb.mockReturnValue({ select })

    await expect(resolveUserIdByGithubIdentity('alice', '42')).resolves.toBe('user-1')
    expect(where).toHaveBeenCalled()
  })

  it('falls back to user.name when no github account row matches', async () => {
    const accountLimit = vi.fn().mockResolvedValue([])
    const accountWhere = vi.fn().mockReturnValue({ limit: accountLimit })
    const accountFrom = vi.fn().mockReturnValue({ where: accountWhere })

    const userLimit = vi.fn().mockResolvedValue([{ id: 'user-2' }])
    const userWhere = vi.fn().mockReturnValue({ limit: userLimit })
    const userFrom = vi.fn().mockReturnValue({ where: userWhere })

    const select = vi.fn()
      .mockReturnValueOnce({ from: accountFrom })
      .mockReturnValueOnce({ from: userFrom })
    mocks.getDb.mockReturnValue({ select })

    await expect(resolveUserIdByGithubIdentity('alice', '99')).resolves.toBe('user-2')
  })
})
