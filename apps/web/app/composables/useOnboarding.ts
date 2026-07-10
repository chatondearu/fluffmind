/** Ensures the signed-in user has a workspace (creates one on first login). */
export async function ensureWorkspaceOnboarding(): Promise<void> {
  await $fetch('/api/workspaces/onboarding', { method: 'POST' })
}
