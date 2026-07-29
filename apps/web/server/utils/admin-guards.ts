export const ADMIN_USERS_DEFAULT_LIMIT = 50
export const ADMIN_USERS_MAX_LIMIT = 200

export function parseAdminUsersLimit(limitRaw: unknown): number {
  const parsed = typeof limitRaw === 'string' ? Number(limitRaw) : Number.NaN
  const value = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : ADMIN_USERS_DEFAULT_LIMIT
  return Math.min(ADMIN_USERS_MAX_LIMIT, Math.max(1, value))
}

export function isInstanceAdminRole(role: string | null | undefined): boolean {
  return role === 'admin'
}

/**
 * Blocks demoting or disabling the last remaining instance admin.
 * Prevents permanent lockout of `/settings/admin`.
 */
export function wouldRemoveLastAdmin(options: {
  targetIsAdmin: boolean
  adminCount: number
}): boolean {
  if (!options.targetIsAdmin)
    return false
  return options.adminCount <= 1
}
