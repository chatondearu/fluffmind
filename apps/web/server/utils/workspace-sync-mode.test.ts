import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkspaceSyncMode,
  requireSyncModeInput,
  setWorkspaceSyncMode,
} from './workspace-sync-mode'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  createError: vi.fn((input: { statusCode: number, message: string }) => {
    const error = new Error(input.message) as Error & { statusCode: number }
    error.statusCode = input.statusCode
    return error
  }),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  workspaceConfig: {
    organizationId: 'organizationId',
    syncMode: 'syncMode',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

vi.stubGlobal('createError', mocks.createError)

function mockDbRow(syncMode: string | undefined) {
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(
          syncMode === undefined ? [] : [{ syncMode }],
        ),
      }),
    }),
  })
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  mocks.getDb.mockReturnValue({
    select,
    update,
  })

  return { select, update, updateSet, updateWhere }
}

describe('requireSyncModeInput', () => {
  it('accepts exact enum values only', () => {
    expect(requireSyncModeInput('git-live')).toBe('git-live')
    expect(requireSyncModeInput('mesh-live')).toBe('mesh-live')
  })

  it('rejects aliases and invalid values (no silent default)', () => {
    expect(() => requireSyncModeInput('mesh')).toThrow(/syncMode/)
    expect(() => requireSyncModeInput('git')).toThrow(/syncMode/)
    expect(() => requireSyncModeInput('')).toThrow(/syncMode/)
    expect(() => requireSyncModeInput(undefined)).toThrow(/syncMode/)
  })
})

describe('getWorkspaceSyncMode / setWorkspaceSyncMode', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reads syncMode from workspace_config', async () => {
    mockDbRow('mesh-live')
    await expect(getWorkspaceSyncMode('org_1')).resolves.toBe('mesh-live')
  })

  it('404 when workspace_config is missing', async () => {
    mockDbRow(undefined)
    await expect(getWorkspaceSyncMode('missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('updates syncMode and returns previous (opt-in / rollback)', async () => {
    const { updateSet } = mockDbRow('git-live')

    await expect(setWorkspaceSyncMode('org_1', 'mesh-live')).resolves.toEqual({
      syncMode: 'mesh-live',
      previousSyncMode: 'git-live',
    })

    expect(updateSet).toHaveBeenCalledWith({ syncMode: 'mesh-live' })
  })

  it('skips update when mode is unchanged', async () => {
    const { update } = mockDbRow('mesh-live')

    await expect(setWorkspaceSyncMode('org_1', 'mesh-live')).resolves.toEqual({
      syncMode: 'mesh-live',
      previousSyncMode: 'mesh-live',
    })

    expect(update).not.toHaveBeenCalled()
  })
})
