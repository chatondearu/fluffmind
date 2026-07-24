import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchInstallationAccount,
  removeGithubAppInstallation,
  unlinkWorkspacesForRemovedRepositories,
} from './github-installations'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  createAppJwt: vi.fn(),
  createInstallationToken: vi.fn(),
}))

vi.mock('@fluffmind/db', () => ({
  getDb: mocks.getDb,
  githubAppInstallation: {
    installationId: 'installationId',
  },
  member: {
    organizationId: 'organizationId',
    role: 'role',
    userId: 'userId',
  },
  workspaceGithubLink: {
    installationId: 'installationId',
    organizationId: 'organizationId',
    owner: 'owner',
    repo: 'repo',
  },
}))

vi.mock('@fluffmind/integrations', () => ({
  createAppJwt: mocks.createAppJwt,
  createInstallationToken: mocks.createInstallationToken,
}))

// Replace drizzle-orm's real SQL builders with plain, inspectable objects so tests can
// assert on the value a `.where(eq(...))` call was built with, instead of parsing
// drizzle's internal SQL chunk representation.
vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
  and: (...conditions: unknown[]) => ({ __op: 'and', conditions }),
}))

function mockDeleteChain() {
  const calls: Array<{ table: unknown, whereArgs: unknown[] }> = []
  const del = vi.fn((table: unknown) => ({
    where: vi.fn((...whereArgs: unknown[]) => {
      calls.push({ table, whereArgs })
      return Promise.resolve()
    }),
  }))
  mocks.getDb.mockReturnValue({ delete: del })
  return calls
}

/** Wires `getDb()` to serve `select().from().where()` link rows and records every `delete().where(...)` call. */
function mockSelectThenDelete(rows: Array<Record<string, unknown>>) {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const deleteCalls: Array<{ organizationId: string }> = []
  const del = vi.fn(() => ({
    where: vi.fn((condition: { value?: string }) => {
      deleteCalls.push({ organizationId: condition.value ?? '' })
      return Promise.resolve()
    }),
  }))

  mocks.getDb.mockReturnValue({ select, delete: del })
  return { deleteCalls }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  delete process.env.GITHUB_APP_ID
  delete process.env.GITHUB_APP_PRIVATE_KEY
})

describe('removeGithubAppInstallation', () => {
  it('clears the installation row and every workspace link bound to it', async () => {
    const calls = mockDeleteChain()

    await removeGithubAppInstallation('123')

    expect(calls).toHaveLength(2)
    // Related workspace links must be pruned before (or alongside) the installation
    // row itself, and vault files on disk are never touched.
    expect(calls[0]!.table).toEqual({
      installationId: 'installationId',
      organizationId: 'organizationId',
      owner: 'owner',
      repo: 'repo',
    })
    expect(calls[1]!.table).toEqual({ installationId: 'installationId' })
  })
})

describe('unlinkWorkspacesForRemovedRepositories', () => {
  it('clears matching links case-insensitively', async () => {
    const rows = [
      { organizationId: 'org-match', owner: 'acme', repo: 'vault' },
      { organizationId: 'org-no-match', owner: 'acme', repo: 'other-repo' },
    ]
    const { deleteCalls } = mockSelectThenDelete(rows)

    await unlinkWorkspacesForRemovedRepositories('123', ['Acme/Vault'])

    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0]!.organizationId).toBe('org-match')
  })

  it('does nothing when no repos are removed', async () => {
    mocks.getDb.mockReturnValue({ select: vi.fn() })

    await unlinkWorkspacesForRemovedRepositories('123', [])

    expect(mocks.getDb).not.toHaveBeenCalled()
  })

  it('ignores repo identifiers that cannot be parsed', async () => {
    mocks.getDb.mockReturnValue({ select: vi.fn() })

    await unlinkWorkspacesForRemovedRepositories('123', ['not-a-repo-identifier'])

    expect(mocks.getDb).not.toHaveBeenCalled()
  })
})

describe('fetchInstallationAccount', () => {
  function stubCreateError() {
    vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage: string, message: string }) =>
      Object.assign(new Error(opts.message), { statusCode: opts.statusCode, statusMessage: opts.statusMessage }))
  }

  function withCredentials() {
    process.env.GITHUB_APP_ID = '123'
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nkey'
  }

  it('maps the GitHub installation payload to accountLogin/accountType', async () => {
    withCredentials()
    stubCreateError()
    mocks.createAppJwt.mockResolvedValue({ token: 'jwt_test', expiresAt: '2026-07-24T18:00:00Z' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 456, account: { login: 'Acme', type: 'Organization' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchInstallationAccount('456')).resolves.toEqual({
      accountLogin: 'Acme',
      accountType: 'Organization',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/456',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt_test' }),
      }),
    )
  })

  it('rejects with a 404 when the installation is not found or not accessible', async () => {
    withCredentials()
    stubCreateError()
    mocks.createAppJwt.mockResolvedValue({ token: 'jwt_test', expiresAt: '2026-07-24T18:00:00Z' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))

    await expect(fetchInstallationAccount('999')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects when the GitHub App is not configured', async () => {
    await expect(fetchInstallationAccount('456')).rejects.toThrow('GitHub App credentials are not configured.')
  })
})
