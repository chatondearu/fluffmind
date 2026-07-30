import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
}))

const { loadConfig } = await import('./config.ts')

function fileMissing() {
  mocks.readFileSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  })
}

describe('loadConfig', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('flags win over env and config file', () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ url: 'file-url', token: 'file-token' }))

    const config = loadConfig(
      { FLUFFMIND_URL: 'env-url', FLUFFMIND_TOKEN: 'env-token' },
      { url: 'flag-url', token: 'flag-token' },
    )

    expect(config).toEqual({ url: 'flag-url', token: 'flag-token' })
  })

  it('env wins over the config file when no flags are given', () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ url: 'file-url', token: 'file-token' }))

    const config = loadConfig({ FLUFFMIND_URL: 'env-url', FLUFFMIND_TOKEN: 'env-token' }, {})

    expect(config).toEqual({ url: 'env-url', token: 'env-token' })
  })

  it('falls back to the config file when no flags or env vars are set', () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ url: 'file-url', token: 'file-token' }))

    const config = loadConfig({}, {})

    expect(config).toEqual({ url: 'file-url', token: 'file-token' })
  })

  it('resolves to empty strings when nothing is configured', () => {
    fileMissing()

    const config = loadConfig({}, {})

    expect(config).toEqual({ url: '', token: '' })
  })

  it('ignores an unreadable or malformed config file', () => {
    mocks.readFileSync.mockReturnValue('not json')

    const config = loadConfig({ FLUFFMIND_URL: 'env-url' }, {})

    expect(config).toEqual({ url: 'env-url', token: '' })
  })

  it('ignores non-string fields in the config file', () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ url: 42, token: null }))

    const config = loadConfig({}, {})

    expect(config).toEqual({ url: '', token: '' })
  })
})
