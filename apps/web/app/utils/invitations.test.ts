import { describe, expect, it } from 'vitest'

import { buildAcceptInvitationUrl, extractInvitationIdFromInviteMemberResponse } from './invitations'

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
})
