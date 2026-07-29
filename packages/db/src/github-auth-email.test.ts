import { describe, expect, it } from 'vitest'

import { buildGithubNoreplyEmail } from './github-auth-email'

describe('buildGithubNoreplyEmail', () => {
  it('builds id+login noreply and normalizes login', () => {
    expect(buildGithubNoreplyEmail({ id: '42', login: 'OctoCat' })).toBe(
      '42+octocat@users.noreply.github.com',
    )
  })

  it('trims id and login', () => {
    expect(buildGithubNoreplyEmail({ id: ' 99 ', login: ' octocat ' })).toBe(
      '99+octocat@users.noreply.github.com',
    )
  })

  it('throws when id or login is missing', () => {
    expect(() => buildGithubNoreplyEmail({ id: '', login: 'octocat' })).toThrow(/id and login/i)
    expect(() => buildGithubNoreplyEmail({ id: '1', login: '   ' })).toThrow(/id and login/i)
  })
})
