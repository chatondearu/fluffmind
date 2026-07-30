import { getDb, workspaceConfig } from '@fluffmind/db'
import { eq } from 'drizzle-orm'

import { normalizeContentRoots } from '../vault/content-roots'

export class ContentRootsImmutableError extends Error {
  constructor() {
    super('contentRoots can only be set while still empty.')
    this.name = 'ContentRootsImmutableError'
  }
}

export interface ContentRootsUpdate {
  contentRoots: string[]
  shouldUpdate: boolean
}

export async function validateWorkspaceContentRootsUpdate(
  organizationId: string,
  incoming: unknown,
): Promise<ContentRootsUpdate> {
  const next = normalizeContentRoots(incoming)
  const db = getDb()
  const [row] = await db
    .select({ contentRoots: workspaceConfig.contentRoots })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, organizationId))
    .limit(1)
  const current = Array.isArray(row?.contentRoots) ? row.contentRoots : []

  if (current.length > 0) {
    if (JSON.stringify(current) !== JSON.stringify(next))
      throw new ContentRootsImmutableError()

    return { contentRoots: current, shouldUpdate: false }
  }

  return { contentRoots: next, shouldUpdate: next.length > 0 }
}

export async function setWorkspaceContentRootsIfAllowed(
  organizationId: string,
  incoming: unknown,
  preparedUpdate?: ContentRootsUpdate,
): Promise<string[]> {
  const { contentRoots, shouldUpdate } = preparedUpdate
    ?? await validateWorkspaceContentRootsUpdate(organizationId, incoming)

  if (shouldUpdate) {
    const db = getDb()
    await db
      .update(workspaceConfig)
      .set({ contentRoots })
      .where(eq(workspaceConfig.organizationId, organizationId))
  }

  return contentRoots
}
