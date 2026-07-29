/**
 * Server-side signup policy for invite-only instances.
 * Used by Better Auth `user.create.before` — client middleware alone is not enough.
 */

export function isPublicSignupEnabled(envValue: string | undefined = process.env.AUTH_PUBLIC_SIGNUP): boolean {
  return envValue === 'true'
}

export function canCreateUser(options: {
  publicSignupEnabled: boolean
  existingUserCount: number
  hasPendingInvitation: boolean
}): boolean {
  if (options.existingUserCount === 0)
    return true
  if (options.publicSignupEnabled)
    return true
  return options.hasPendingInvitation
}
