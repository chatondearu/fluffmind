import { describe, expect, it } from 'vitest'
import { daemonProxyTarget } from './daemon-proxy'

describe('daemonProxyTarget', () => {
  it('proxies /__daemon in portable/solo (daemon URL set, auth off), keeping the query', () => {
    expect(daemonProxyTarget({ daemonUrl: 'http://127.0.0.1:8787/', authEnabled: false }, '/__daemon/v1/notes?id=a'))
      .toBe('http://127.0.0.1:8787/v1/notes?id=a')
  })

  it('has no target when auth is on (hosted)', () => {
    expect(daemonProxyTarget({ daemonUrl: 'http://sync:8787', authEnabled: true }, '/__daemon/v1/notes')).toBeNull()
  })

  it('has no target without a daemon URL', () => {
    expect(daemonProxyTarget({ daemonUrl: '', authEnabled: false }, '/__daemon/v1/notes')).toBeNull()
  })

  it('only proxies the note facade, never mesh/admin routes', () => {
    const opts = { daemonUrl: 'http://127.0.0.1:8787', authEnabled: false }
    expect(daemonProxyTarget(opts, '/__daemon/health')).toBe('http://127.0.0.1:8787/health')
    for (const path of ['/v1/vaults/default/tickets', '/v1/vaults/x', '/v1/mesh/changed', '/v1/events', '/v1/notes/../vaults', '/v1/notesx'])
      expect(daemonProxyTarget(opts, `/__daemon${path}`)).toBeNull()
  })
})
