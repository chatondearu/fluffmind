import { describe, expect, it } from 'vitest'

import {
  githubInvitationMatchesSignupEmail,
  hasPendingGithubInvitationForSignup,
  resolveGithubSignupEmail,
} from './auth'

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

  it('matches a pending invitation by GitHub login when the OAuth email differs', () => {
    expect(hasPendingGithubInvitationForSignup({
      email: 'private@example.com',
      githubLogin: 'inviteduser',
      invitations: [{
        githubLogin: 'InvitedUser',
        githubUserId: '42',
        resolvedEmail: 'invited@users.noreply.github.com',
        status: 'pending',
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      }],
      now: new Date('2026-07-29T00:00:00Z'),
    })).toBe(true)
  })

  it('does not match an expired GitHub invitation by login', () => {
    expect(hasPendingGithubInvitationForSignup({
      email: 'private@example.com',
      githubLogin: 'inviteduser',
      invitations: [{
        githubLogin: 'InvitedUser',
        githubUserId: '42',
        resolvedEmail: null,
        status: 'pending',
        expiresAt: new Date('2026-07-28T00:00:00Z'),
      }],
      now: new Date('2026-07-29T00:00:00Z'),
    })).toBe(false)
  })
})

describe('resolveGithubSignupEmail', () => {
  it('uses the resolved email of a matching GitHub invitation', () => {
    expect(resolveGithubSignupEmail(
      {
        id: 42,
        login: 'InvitedUser',
        email: 'private@example.com',
      },
      {
        githubLogin: 'InvitedUser',
        githubUserId: '42',
        resolvedEmail: 'Invitation@Example.com',
      },
    )).toBe('invitation@example.com')
  })

  it('builds a noreply email from the OAuth profile when the invitation has no email', () => {
    expect(resolveGithubSignupEmail(
      {
        id: 42,
        login: 'InvitedUser',
        email: 'private@example.com',
      },
      {
        githubLogin: 'InvitedUser',
        githubUserId: null,
        resolvedEmail: null,
      },
    )).toBe('42+inviteduser@users.noreply.github.com')
  })
})
