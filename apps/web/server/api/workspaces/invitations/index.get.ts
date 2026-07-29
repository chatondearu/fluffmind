import {
  getDb,
  githubInvitation,
  invitation as betterAuthInvitation,
} from '@fluffmind/db'
import { and, eq } from 'drizzle-orm'

import { requireWorkspaceManage } from '../../../utils/workspace-membership'

export default defineEventHandler(async (event) => {
  const workspaceId = await requireWorkspaceManage(event)

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
    ))
})
