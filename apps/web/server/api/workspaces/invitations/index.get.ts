import {
  getDb,
  githubInvitation,
  invitation as betterAuthInvitation,
} from '@fluffmind/db'
import { and, eq, gt } from 'drizzle-orm'

import {
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'

export default defineEventHandler(async (event) => {
  const workspaceId = parseWorkspaceId(getQuery(event).workspaceId)
  await requireWorkspaceManageAuthority(event, workspaceId)

  return getDb()
    .select({
      id: betterAuthInvitation.id,
      role: betterAuthInvitation.role,
      status: betterAuthInvitation.status,
      expiresAt: betterAuthInvitation.expiresAt,
      email: betterAuthInvitation.email,
      githubLogin: githubInvitation.githubLogin,
    })
    .from(betterAuthInvitation)
    .leftJoin(
      githubInvitation,
      and(
        eq(githubInvitation.betterAuthInvitationId, betterAuthInvitation.id),
        eq(githubInvitation.organizationId, workspaceId),
      ),
    )
    .where(and(
      eq(betterAuthInvitation.organizationId, workspaceId),
      eq(betterAuthInvitation.status, 'pending'),
      gt(betterAuthInvitation.expiresAt, new Date()),
    ))
})
