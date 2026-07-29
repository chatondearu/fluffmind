import type { H3Event } from 'h3'

import { requireWorkspacePermission } from './auth'

export async function requireWorkspaceManage(event: H3Event): Promise<string> {
  return requireWorkspacePermission(event, 'workspace', 'manage')
}
