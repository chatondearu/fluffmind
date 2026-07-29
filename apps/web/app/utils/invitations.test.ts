import { describe, expect, it } from 'vitest'

import {
  acceptInvitationWithFallback,
  buildAcceptInvitationUrl,
  buildWorkspaceInvitationPayload,
  extractInvitationIdFromInviteMemberResponse,
  formatInvitationRecipient,
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

  it('falls back to the workspace endpoint when Better Auth rejects the invitation', async () => {
    const acceptWithBetterAuth = async () => ({
      error: { message: 'Invitation introuvable.' },
    })
    const acceptWithWorkspace = async () => ({ ok: true as const })

    await expect(acceptInvitationWithFallback(
      'inv_1',
      acceptWithBetterAuth,
      acceptWithWorkspace,
    )).resolves.toEqual({ ok: true })
  })

  it('does not call the fallback when Better Auth accepts the invitation', async () => {
    let fallbackCalled = false

    await expect(acceptInvitationWithFallback(
      'inv_1',
      async () => ({ data: { id: 'inv_1' } }),
      async () => {
        fallbackCalled = true
        return { ok: true as const }
      },
    )).resolves.toEqual({ ok: true })

    expect(fallbackCalled).toBe(false)
  })
})
