import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ContentRootsImmutableError,
  setWorkspaceContentRootsIfAllowed,
} from './content-roots-config'
import { InvalidContentRootError } from '../vault/content-roots'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  workspaceConfig: {
    organizationId: 'organizationId',
    contentRoots: 'contentRoots',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

function mockCurrentRoots(contentRoots: string[]) {
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  mocks.getDb.mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ contentRoots }]),
        }),
      }),
    }),
    update,
  })

  return { update, updateSet, updateWhere }
}

describe('setWorkspaceContentRootsIfAllowed', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes and persists non-empty roots while the workspace is unset', async () => {
    const { updateSet } = mockCurrentRoots([])

    await expect(setWorkspaceContentRootsIfAllowed('org_1', ['/foam', ' docs ']))
      .resolves.toEqual(['foam', 'docs'])

    expect(updateSet).toHaveBeenCalledWith({ contentRoots: ['foam', 'docs'] })
  })

  it('does not update when the incoming roots are empty', async () => {
    const { update } = mockCurrentRoots([])

    await expect(setWorkspaceContentRootsIfAllowed('org_1', [])).resolves.toEqual([])

    expect(update).not.toHaveBeenCalled()
  })

  it('does not update when the incoming roots equal the existing roots', async () => {
    const { update } = mockCurrentRoots(['foam'])

    await expect(setWorkspaceContentRootsIfAllowed('org_1', ['foam'])).resolves.toEqual(['foam'])

    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an attempted change after roots are set', async () => {
    mockCurrentRoots(['foam'])

    await expect(setWorkspaceContentRootsIfAllowed('org_1', ['docs']))
      .rejects.toBeInstanceOf(ContentRootsImmutableError)
  })

  it('preserves invalid-root validation', async () => {
    mockCurrentRoots([])

    await expect(setWorkspaceContentRootsIfAllowed('org_1', ['../foam']))
      .rejects.toBeInstanceOf(InvalidContentRootError)
  })
})
