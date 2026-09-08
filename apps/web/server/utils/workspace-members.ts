import { getDb, member, organization, user } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

export interface WorkspaceMemberRow {
  memberId: string
  userId: string
  email: string
  name: string
  role: string
}

export interface AdminWorkspaceMembersGroup {
  organizationId: string
  name: string
  slug: string
  members: WorkspaceMemberRow[]
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const db = getDb()
  return db
    .select({
      memberId: member.id,
      userId: member.userId,
      email: user.email,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, workspaceId))
}

export async function listAllWorkspaceMembers(): Promise<AdminWorkspaceMembersGroup[]> {
  const db = getDb()
  const rows = await db
    .select({
      organizationId: organization.id,
      organizationName: organization.name,
      slug: organization.slug,
      memberId: member.id,
      userId: member.userId,
      email: user.email,
      userName: user.name,
      role: member.role,
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .leftJoin(user, eq(user.id, member.userId))

  const byOrg = new Map<string, AdminWorkspaceMembersGroup>()
  for (const row of rows) {
    let group = byOrg.get(row.organizationId)
    if (!group) {
      group = {
        organizationId: row.organizationId,
        name: row.organizationName,
        slug: row.slug,
        members: [],
      }
      byOrg.set(row.organizationId, group)
    }
    if (row.memberId && row.userId && row.email != null && row.userName != null && row.role != null) {
      group.members.push({
        memberId: row.memberId,
        userId: row.userId,
        email: row.email,
        name: row.userName,
        role: row.role,
      })
    }
  }

  return [...byOrg.values()]
}
