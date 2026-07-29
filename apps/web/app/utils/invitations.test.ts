import { describe, expect, it } from 'vitest'

import {
  acceptInvitationWithFallback,
  buildAcceptInvitationUrl,
  buildWorkspaceInvitationPayload,
  extractInvitationIdFromInviteMemberResponse,
  formatInvitationRecipient,
  loadGithubInviteCandidates,
} from './invitations'

describe('invitations', () => {
  it('builds accept-invitation URL from an invitationId', () => {
    expect(buildAcceptInvitationUrl('inv_123')).toBe('/accept-invitation/inv_123')
  })

  it('extracts invitationId from Better Auth inviteMember response shapes', () => {
    expect(extractInvitationIdFromInviteMemberResponse({ data: { id: 'inv_1' } })).toBe('inv_1')
    expect(extractInvitationIdFromInviteMemberResponse({ data: { invitationId: 'inv_2' } })).toBe('inv_2')
    expect(extractInvitationIdFromInviteMemberResponse({ invitationId: 'inv_3' })).toBe('inv_3')
    expect(extractInvitationIdFromInviteMemberResponse(null)).toBeNull()
    expect(extractInvitationIdFromInviteMemberResponse({})).toBeNull()
    expect(extractInvitationIdFromInviteMemberResponse({ data: null })).toBeNull()
    expect(extractInvitationIdFromInviteMemberResponse({ data: { id: 123 } })).toBeNull()
  })

  it('builds a workspace invitation from an email or GitHub login', () => {
    expect(buildWorkspaceInvitationPayload({
      email: ' Member@Example.com ',
      githubLogin: ' typed-login ',
      selectedGithubLogin: 'selected-login',
      role: 'write',
    })).toEqual({
      email: 'member@example.com',
      githubLogin: 'typed-login',
      role: 'write',
    })

    expect(buildWorkspaceInvitationPayload({
      email: '',
      githubLogin: '',
      selectedGithubLogin: ' selected-login ',
      role: 'read',
    })).toEqual({
      githubLogin: 'selected-login',
      role: 'read',
    })

    expect(buildWorkspaceInvitationPayload({
      email: ' ',
      githubLogin: ' ',
      selectedGithubLogin: '',
      role: 'owner',
    })).toBeNull()
  })

  it('formats a pending invitation recipient from its GitHub login or email', () => {
    expect(formatInvitationRecipient({ githubLogin: 'octocat', email: 'octocat@example.com' })).toBe('@octocat')
    expect(formatInvitationRecipient({ githubLogin: null, email: 'member@example.com' })).toBe('member@example.com')
  })

  it('returns an empty list when GitHub candidates are unavailable', async () => {
    await expect(loadGithubInviteCandidates(async () => {
      throw new Error('GitHub API unavailable')
    })).resolves.toEqual([])
  })

  it('accepts through the workspace endpoint before Better Auth', async () => {
    const calls: string[] = []
    const acceptWithWorkspace = async () => {
      calls.push('workspace')
      return { ok: true as const }
    }
    const acceptWithBetterAuth = async () => {
      calls.push('better-auth')
      return { data: { id: 'inv_1' } }
    }

    await expect(acceptInvitationWithFallback(
      'inv_1',
      acceptWithWorkspace,
      acceptWithBetterAuth,
    )).resolves.toEqual({ ok: true })

    expect(calls).toEqual(['workspace'])
  })

  it('falls back to Better Auth only when the workspace invitation is not found', async () => {
    const calls: string[] = []

    await expect(acceptInvitationWithFallback(
      'inv_1',
      async () => {
        calls.push('workspace')
        throw Object.assign(new Error('Not found'), { statusCode: 404 })
      },
      async () => {
        calls.push('better-auth')
        return { data: { id: 'inv_1' } }
      },
    )).resolves.toEqual({ ok: true })

    expect(calls).toEqual(['workspace', 'better-auth'])
  })

  it('does not bypass a forbidden workspace invitation through Better Auth', async () => {
    let betterAuthCalled = false
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })

    await expect(acceptInvitationWithFallback(
      'inv_1',
      async () => {
        throw forbidden
      },
      async () => {
        betterAuthCalled = true
        return { data: { id: 'inv_1' } }
      },
    )).rejects.toBe(forbidden)

    expect(betterAuthCalled).toBe(false)
  })
})
