import { describe, expect, it } from 'vitest'
import { daemonProxyRules } from './daemon-proxy'

describe('daemonProxyRules', () => {
  it('proxies /__daemon in portable/solo (daemon URL set, auth off)', () => {
    expect(daemonProxyRules({ daemonUrl: 'http://127.0.0.1:8787/', authEnabled: false })).toEqual({
      '/__daemon/**': { proxy: 'http://127.0.0.1:8787/**' },
    })
  })

  it('registers nothing when auth is on (hosted)', () => {
    expect(daemonProxyRules({ daemonUrl: 'http://sync:8787', authEnabled: true })).toEqual({})
  })

  it('registers nothing without a daemon URL', () => {
    expect(daemonProxyRules({ daemonUrl: '', authEnabled: false })).toEqual({})
  })
})
