export function extractInvitationIdFromInviteMemberResponse(response: unknown): string | null {
  const asRecord = response as Record<string, unknown> | null
  if (!asRecord || typeof asRecord !== 'object')
    return null

  const topLevelId = asRecord.invitationId
  if (typeof topLevelId === 'string' && topLevelId.trim())
    return topLevelId

  const data = asRecord.data
  const dataRecord = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null
  if (!dataRecord)
    return null

  const id = dataRecord.id
  if (typeof id === 'string' && id.trim())
    return id

  const dataInvitationId = dataRecord.invitationId
  if (typeof dataInvitationId === 'string' && dataInvitationId.trim())
    return dataInvitationId

  return null
}

export function buildAcceptInvitationUrl(invitationId: string): string {
  return `/accept-invitation/${invitationId}`
}
