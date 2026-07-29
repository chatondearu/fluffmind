import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requireSession } from './auth'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getAuth: () => ({
    api: {
      getSession: mocks.getSession,
    },
  }),
}))

const event = { headers: new Headers() } as unknown as H3Event

describe('requireSession disabledAt enforcement', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', (options: {
      statusCode: number
      statusMessage: string
      message: string
    }) => Object.assign(new Error(options.message), options))
  })

  afterEach(() => {
    delete process.env.AUTH_DISABLED
    delete process.env.DATABASE_URL
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('throws 400 when auth is disabled by env', async () => {
    process.env.AUTH_DISABLED = 'true'
    process.env.DATABASE_URL = 'postgres://x'

    await expect(requireSession(event)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('throws 401 when there is no session', async () => {
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'

    mocks.getSession.mockResolvedValue(null)

    await expect(requireSession(event)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('throws 403 when the Better Auth user has disabledAt set', async () => {
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'

    mocks.getSession.mockResolvedValue({
      user: {
        id: 'user_1',
        disabledAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })

    await expect(requireSession(event)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('allows the session when disabledAt is null', async () => {
    process.env.AUTH_DISABLED = 'false'
    process.env.DATABASE_URL = 'postgres://x'

    mocks.getSession.mockResolvedValue({
      user: {
        id: 'user_1',
        disabledAt: null,
      },
    })

    await expect(requireSession(event)).resolves.toMatchObject({
      user: {
        id: 'user_1',
        disabledAt: null,
      },
    })
  })
})
