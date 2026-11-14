import { describe, expect, it } from 'vitest'

import {
  DAEMON_PROXY_PREFIX,
  daemonClientBase,
  daemonHealthUrl,
  daemonNoteGetUrl,
  daemonNotesUrl,
  normalizeDaemonBaseUrl,
  shouldPreferDaemon,
} from './daemon-notes'

describe('daemon-notes helpers', () => {
  it('normalizes trailing slashes', () => {
    expect(normalizeDaemonBaseUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787')
    expect(normalizeDaemonBaseUrl('  ')).toBe('')
  })

  it('prefers daemon only when auth is off and url is set', () => {
    expect(shouldPreferDaemon({ authEnabled: false, daemonUrl: 'http://127.0.0.1:8787' })).toBe(true)
    expect(shouldPreferDaemon({ authEnabled: true, daemonUrl: 'http://127.0.0.1:8787' })).toBe(false)
    expect(shouldPreferDaemon({ authEnabled: false, daemonUrl: '' })).toBe(false)
  })

  it('uses same-origin proxy as browser client base', () => {
    expect(daemonClientBase('http://127.0.0.1:8787')).toBe(DAEMON_PROXY_PREFIX)
    expect(daemonClientBase('')).toBe('')
  })

  it('builds health and notes URLs', () => {
    const base = 'http://127.0.0.1:8787/'
    expect(daemonHealthUrl(base)).toBe('http://127.0.0.1:8787/health')
    expect(daemonNotesUrl(base)).toBe('http://127.0.0.1:8787/v1/notes')
    expect(daemonNoteGetUrl(base, 'smoke', 'device:solo')).toBe(
      'http://127.0.0.1:8787/v1/notes?id=smoke&writer=device%3Asolo',
    )
    expect(daemonNotesUrl(DAEMON_PROXY_PREFIX)).toBe('/__daemon/v1/notes')
  })
})
