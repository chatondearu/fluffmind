import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireAdminInstance: vi.fn(),
  getDb: vi.fn(),
  insertAdminAudit: vi.fn(),
}))

vi.mock('./auth', () => ({ requireSession: mocks.requireSession }))
vi.mock('./admin', () => ({ requireAdminInstance: mocks.requireAdminInstance }))
vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  member: { role: 'role', organizationId: 'organizationId', userId: 'userId' },
  insertAdminAudit: mocks.insertAdminAudit,
}))

// eslint-disable-next-line import/first
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from './workspace-manage-authority'

const event = { headers: new Headers() } as unknown as H3Event

describe('parseWorkspaceId', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (o: object) => Object.assign(new Error('x'), o))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('trims a valid id', () => {
    expect(parseWorkspaceId('  ws-1  ')).toBe('ws-1')
  })

  it('rejects empty', () => {
    expect(() => parseWorkspaceId('')).toThrow()
  })
})

describe('requireWorkspaceManageAuthority', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (o: object) => Object.assign(new Error('x'), o))
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('allows instance admin without membership', async () => {
    const session = { user: { id: 'a1', role: 'admin' } }
    mocks.requireSession.mockResolvedValue(session)
    mocks.requireAdminInstance.mockResolvedValue(session)

    await expect(requireWorkspaceManageAuthority(event, 'ws-foreign')).resolves.toMatchObject({
      workspaceId: 'ws-foreign',
      actor: 'admin',
    })
  })

  it('allows owner member', async () => {
    const session = { user: { id: 'u1', role: 'user' } }
    mocks.requireSession.mockResolvedValue(session)
    mocks.requireAdminInstance.mockRejectedValue(
      Object.assign(new Error('Admin instance required.'), { statusCode: 403 }),
    )
    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ role: 'owner' }],
          }),
        }),
      }),
    })

    await expect(requireWorkspaceManageAuthority(event, 'ws-1')).resolves.toMatchObject({
      workspaceId: 'ws-1',
      actor: 'owner',
    })
  })

  it('rejects non-owner non-admin with 403', async () => {
    const session = { user: { id: 'u2', role: 'user' } }
    mocks.requireSession.mockResolvedValue(session)
    mocks.requireAdminInstance.mockRejectedValue(
      Object.assign(new Error('Admin instance required.'), { statusCode: 403 }),
    )
    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ role: 'write' }],
          }),
        }),
      }),
    })

    await expect(requireWorkspaceManageAuthority(event, 'ws-1')).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})

describe('auditAdminAction', () => {
  it('writes only for admin actor', async () => {
    const session = { user: { id: 'a1', role: 'admin' } }
    await auditAdminAction(
      { workspaceId: 'ws-1', actor: 'admin', session: session as never },
      'workspace.github.sync',
      { run: true },
    )
    expect(mocks.insertAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'a1',
      actor: 'admin',
      action: 'workspace.github.sync',
      targetWorkspaceId: 'ws-1',
    }))

    mocks.insertAdminAudit.mockClear()
    await auditAdminAction(
      { workspaceId: 'ws-1', actor: 'owner', session: session as never },
      'workspace.github.sync',
    )
    expect(mocks.insertAdminAudit).not.toHaveBeenCalled()
  })
})
