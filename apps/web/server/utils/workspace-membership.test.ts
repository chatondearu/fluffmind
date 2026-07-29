import { describe, expect, it, vi } from 'vitest'

import { requireWorkspaceManage } from './workspace-membership'

const mocks = vi.hoisted(() => ({
  requireWorkspacePermission: vi.fn(),
}))

vi.mock('./auth', () => ({
  requireWorkspacePermission: mocks.requireWorkspacePermission,
}))

describe('requireWorkspaceManage', () => {
  it('requires workspace manage permission and returns the workspace id', async () => {
    const event = { headers: new Headers() }
    mocks.requireWorkspacePermission.mockResolvedValue('org_1')

    await expect(requireWorkspaceManage(event as never)).resolves.toBe('org_1')
    expect(mocks.requireWorkspacePermission).toHaveBeenCalledWith(event, 'workspace', 'manage')
  })
})
