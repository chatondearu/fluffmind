import { describe, expect, it } from 'vitest'

import {
  canAcceptGithubInvitation,
  githubInvitationMatchesSignupEmail,
  hasPendingGithubInvitationForSignup,
  resolveGithubSignupEmail,
} from './auth'

describe('canAcceptGithubInvitation', () => {
  it('denies a GitHub invitation when the user has no linked GitHub account', () => {
    expect(canAcceptGithubInvitation({
      invitation: {
        githubLogin: 'octocat',
        githubUserId: '42',
      },
      githubAccountIds: [],
    })).toBe(false)
  })

  it('allows a GitHub invitation when the linked account matches its login', () => {
    expect(canAcceptGithubInvitation({
      invitation: {
        githubLogin: 'OctoCat',
        githubUserId: '42',
      },
      githubAccountIds: ['octocat'],
    })).toBe(true)
  })

  it('allows a GitHub invitation when the linked account matches its user id', () => {
    expect(canAcceptGithubInvitation({
      invitation: {
        githubLogin: 'octocat',
        githubUserId: '42',
      },
      githubAccountIds: ['42'],
    })).toBe(true)
  })

  it('allows an email-only invitation', () => {
    expect(canAcceptGithubInvitation({
      invitation: null,
      githubAccountIds: [],
    })).toBe(true)
  })
})

describe('githubInvitationMatchesSignupEmail', () => {
  it('matches a resolved GitHub invitation email case-insensitively', () => {
    expect(githubInvitationMatchesSignupEmail('Invitee@Example.com', {
      githubLogin: 'octocat',
      githubUserId: '42',
      resolvedEmail: 'invitee@example.com',
    })).toBe(true)
  })

  it('rejects the predictable GitHub noreply email', () => {
    expect(githubInvitationMatchesSignupEmail(
      '42+octocat@users.noreply.github.com',
      {
        githubLogin: 'OctoCat',
        githubUserId: '42',
        resolvedEmail: null,
      },
    )).toBe(false)
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

  it('rejects a noreply signup with the wrong GitHub user id', () => {
    expect(hasPendingGithubInvitationForSignup({
      email: '999+inviteduser@users.noreply.github.com',
      invitations: [{
        githubLogin: 'InvitedUser',
        githubUserId: '42',
        resolvedEmail: null,
        status: 'pending',
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      }],
      now: new Date('2026-07-29T00:00:00Z'),
    })).toBe(false)
  })

  it('does not match an expired GitHub invitation by email', () => {
    expect(hasPendingGithubInvitationForSignup({
      email: '42+inviteduser@users.noreply.github.com',
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

  it('uses the linked Better Auth invitation email when no resolved email is stored', () => {
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
        betterAuthInvitationEmail: 'GH-Invite-Secret@users.noreply.github.com',
      },
    )).toBe('gh-invite-secret@users.noreply.github.com')
  })
})
