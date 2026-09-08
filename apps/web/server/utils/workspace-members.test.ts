import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  member: {
    id: 'member.id',
    organizationId: 'member.organizationId',
    userId: 'member.userId',
    role: 'member.role',
  },
  user: {
    id: 'user.id',
    email: 'user.email',
    name: 'user.name',
  },
  organization: {
    id: 'organization.id',
    name: 'organization.name',
    slug: 'organization.slug',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
}))

const { listAllWorkspaceMembers, listWorkspaceMembers } = await import('./workspace-members')

describe('listWorkspaceMembers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns member rows joined with user email and name for the workspace', async () => {
    const rows = [
      {
        memberId: 'm-1',
        userId: 'u-1',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'owner',
      },
      {
        memberId: 'm-2',
        userId: 'u-2',
        email: 'bob@example.com',
        name: 'Bob',
        role: 'member',
      },
    ]

    const where = vi.fn().mockResolvedValue(rows)
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const select = vi.fn().mockReturnValue({ from })
    mocks.getDb.mockReturnValue({ select })

    const result = await listWorkspaceMembers('org-1')

    expect(select).toHaveBeenCalledWith({
      memberId: 'member.id',
      userId: 'member.userId',
      email: 'user.email',
      name: 'user.name',
      role: 'member.role',
    })
    expect(from).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'member.organizationId',
    }))
    expect(innerJoin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user.id' }),
      { __op: 'eq', column: 'user.id', value: 'member.userId' },
    )
    expect(where).toHaveBeenCalledWith({
      __op: 'eq',
      column: 'member.organizationId',
      value: 'org-1',
    })
    expect(result).toEqual(rows)
  })

  it('returns an empty array when the workspace has no members', async () => {
    const where = vi.fn().mockResolvedValue([])
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const select = vi.fn().mockReturnValue({ from })
    mocks.getDb.mockReturnValue({ select })

    await expect(listWorkspaceMembers('org-empty')).resolves.toEqual([])
  })
})

describe('listAllWorkspaceMembers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('groups members by organization including empty workspaces', async () => {
    const rows = [
      {
        organizationId: 'org-1',
        organizationName: 'Alpha',
        slug: 'alpha',
        memberId: 'm-1',
        userId: 'u-1',
        email: 'alice@example.com',
        userName: 'Alice',
        role: 'owner',
      },
      {
        organizationId: 'org-1',
        organizationName: 'Alpha',
        slug: 'alpha',
        memberId: 'm-2',
        userId: 'u-2',
        email: 'bob@example.com',
        userName: 'Bob',
        role: 'member',
      },
      {
        organizationId: 'org-2',
        organizationName: 'Beta',
        slug: 'beta',
        memberId: null,
        userId: null,
        email: null,
        userName: null,
        role: null,
      },
    ]

    const leftJoin2 = vi.fn().mockResolvedValue(rows)
    const leftJoin1 = vi.fn().mockReturnValue({ leftJoin: leftJoin2 })
    const from = vi.fn().mockReturnValue({ leftJoin: leftJoin1 })
    const select = vi.fn().mockReturnValue({ from })
    mocks.getDb.mockReturnValue({ select })

    const result = await listAllWorkspaceMembers()

    expect(select).toHaveBeenCalledWith({
      organizationId: 'organization.id',
      organizationName: 'organization.name',
      slug: 'organization.slug',
      memberId: 'member.id',
      userId: 'member.userId',
      email: 'user.email',
      userName: 'user.name',
      role: 'member.role',
    })
    expect(from).toHaveBeenCalledWith(expect.objectContaining({
      id: 'organization.id',
    }))
    expect(result).toEqual([
      {
        organizationId: 'org-1',
        name: 'Alpha',
        slug: 'alpha',
        members: [
          {
            memberId: 'm-1',
            userId: 'u-1',
            email: 'alice@example.com',
            name: 'Alice',
            role: 'owner',
          },
          {
            memberId: 'm-2',
            userId: 'u-2',
            email: 'bob@example.com',
            name: 'Bob',
            role: 'member',
          },
        ],
      },
      {
        organizationId: 'org-2',
        name: 'Beta',
        slug: 'beta',
        members: [],
      },
    ])
  })
})
