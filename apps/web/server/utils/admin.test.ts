import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}))

vi.mock('./auth', () => ({
  requireSession: mocks.requireSession,
}))

// Vitest mock must be configured before importing the module under test.
// eslint-disable-next-line import/first
import { requireAdminInstance } from './admin'

const event = { headers: new Headers() } as unknown as H3Event

describe('requireAdminInstance', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (options: {
      statusCode: number
      statusMessage: string
      message: string
    }) => Object.assign(new Error(options.message), options))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('allows admin instance users', async () => {
    mocks.requireSession.mockResolvedValue({
      user: { role: 'admin' },
    })

    await expect(requireAdminInstance(event)).resolves.toEqual({
      user: { role: 'admin' },
    })
  })

  it('rejects non-admin users with 403', async () => {
    mocks.requireSession.mockResolvedValue({
      user: { role: 'owner' },
    })

    await expect(requireAdminInstance(event)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})
