import { describe, expect, it } from 'vitest'

import { githubInvitationMatchesSignupEmail } from './auth'

describe('githubInvitationMatchesSignupEmail', () => {
  it('matches a resolved GitHub invitation email case-insensitively', () => {
    expect(githubInvitationMatchesSignupEmail('Invitee@Example.com', {
      githubLogin: 'octocat',
      githubUserId: '42',
      resolvedEmail: 'invitee@example.com',
    })).toBe(true)
  })

  it('matches the synthesized GitHub noreply email', () => {
    expect(githubInvitationMatchesSignupEmail(
      '42+octocat@users.noreply.github.com',
      {
        githubLogin: 'OctoCat',
        githubUserId: '42',
        resolvedEmail: null,
      },
    )).toBe(true)
  })

  it('does not synthesize an unsafe noreply address without a GitHub user id', () => {
    expect(githubInvitationMatchesSignupEmail(
      'octocat@users.noreply.github.com',
      {
        githubLogin: 'octocat',
        githubUserId: null,
        resolvedEmail: null,
      },
    )).toBe(false)
  })
})
