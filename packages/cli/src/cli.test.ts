import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
}))

const { main } = await import('./cli.ts')

function jsonResponse(body: unknown, init: { ok?: boolean, status?: number, statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  }
}

describe('main', () => {
  let fetchMock: Mock
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mocks.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })
    vi.stubEnv('FLUFFMIND_URL', '')
    vi.stubEnv('FLUFFMIND_TOKEN', '')
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const flags = ['--url', 'https://vault.example.com', '--token', 'fm_agent_test']

  it('returns 2 and prints usage when no command is given', async () => {
    const exitCode = await main([])
    expect(exitCode).toBe(2)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('missing command'))
  })

  it('returns 2 for an unknown command', async () => {
    const exitCode = await main(['delete', ...flags])
    expect(exitCode).toBe(2)
  })

  it('returns 2 when url/token are missing', async () => {
    const exitCode = await main(['whoami'])
    expect(exitCode).toBe(2)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('missing url/token'))
  })

  it('config prints the resolved config with a redacted token and does not require one', async () => {
    const exitCode = await main(['config', '--url', 'https://vault.example.com', '--token', 'secret'])
    expect(exitCode).toBe(0)
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ url: 'https://vault.example.com', token: '<redacted>' }))
  })

  it('returns 0 and prints JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'org_1' }))
    const exitCode = await main(['whoami', ...flags])
    expect(exitCode).toBe(0)
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ id: 'org_1' }))
  })

  it('--pretty pretty-prints the JSON output', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'org_1' }))
    await main(['whoami', ...flags, '--pretty'])
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ id: 'org_1' }, null, 2))
  })

  it('returns 1 for a 4xx business error (e.g. 404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Note not found' }, { ok: false, status: 404, statusText: 'Not Found' }))
    const exitCode = await main(['read', 'missing', ...flags])
    expect(exitCode).toBe(1)
  })

  it('returns 2 for a 401/403 auth error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'read-only' }, { ok: false, status: 403, statusText: 'Forbidden' }))
    const exitCode = await main(['write', 'alpha', 'x', ...flags])
    expect(exitCode).toBe(2)
  })

  it('returns 3 for a 5xx error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500, statusText: 'Internal Server Error' }))
    const exitCode = await main(['graph', ...flags])
    expect(exitCode).toBe(3)
  })

  it('returns 3 when fetch itself rejects (network error)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const exitCode = await main(['graph', ...flags])
    expect(exitCode).toBe(3)
  })

  it('returns 2 for a command usage error (e.g. missing search query)', async () => {
    const exitCode = await main(['search', ...flags])
    expect(exitCode).toBe(2)
  })
})
