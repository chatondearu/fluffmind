import { describe, expect, it } from 'vitest'

import { buildGitHubHttpsRemoteUrl, withGitHubAccessToken } from './remote-url.ts'

describe('buildGitHubHttpsRemoteUrl', () => {
  it('builds canonical https remote', () => {
    expect(buildGitHubHttpsRemoteUrl('acme', 'vault')).toBe(
      'https://github.com/acme/vault.git',
    )
  })
})

describe('withGitHubAccessToken', () => {
  it('embeds x-access-token userinfo', () => {
    expect(
      withGitHubAccessToken('https://github.com/acme/vault.git', 'ghs_test'),
    ).toBe('https://x-access-token:ghs_test@github.com/acme/vault.git')
  })

  it('replaces existing userinfo', () => {
    expect(
      withGitHubAccessToken(
        'https://x-access-token:old@github.com/acme/vault.git',
        'ghs_new',
      ),
    ).toBe('https://x-access-token:ghs_new@github.com/acme/vault.git')
  })
})
