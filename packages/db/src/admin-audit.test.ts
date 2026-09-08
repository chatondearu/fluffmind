import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
}))

vi.mock('./client.ts', () => ({
  getDb: () => ({
    insert: mocks.insert,
  }),
}))

mocks.insert.mockReturnValue({ values: mocks.values })
mocks.values.mockResolvedValue(undefined)

import { insertAdminAudit } from './admin-audit.ts'

describe('insertAdminAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insert.mockReturnValue({ values: mocks.values })
  })

  it('inserts a row with required fields', async () => {
    await insertAdminAudit({
      actorUserId: 'user-1',
      actor: 'admin',
      action: 'workspace.github.link',
      targetWorkspaceId: 'ws-1',
      detail: { repository: 'acme/notes' },
    })

    expect(mocks.insert).toHaveBeenCalled()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user-1',
      actor: 'admin',
      action: 'workspace.github.link',
      targetWorkspaceId: 'ws-1',
    }))
  })
})
