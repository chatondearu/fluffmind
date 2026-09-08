import { randomUUID } from 'node:crypto'

import { getDb } from './client'
import { adminAudit } from './schema/workspace'

export type AdminAuditActor = 'admin' | 'owner'

export interface InsertAdminAuditInput {
  actorUserId: string
  actor: AdminAuditActor
  action: string
  targetWorkspaceId: string
  detail?: Record<string, unknown>
}

export async function insertAdminAudit(input: InsertAdminAuditInput): Promise<void> {
  const db = getDb()
  await db.insert(adminAudit).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    actor: input.actor,
    action: input.action,
    targetWorkspaceId: input.targetWorkspaceId,
    detail: input.detail === undefined ? null : JSON.stringify(input.detail),
  })
}
