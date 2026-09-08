/**
 * Shared danger-zone mutations for instance-admin workspace ops.
 * Confirmation currently uses window.prompt; Task 9 will swap to ConfirmActionDialog
 * via requestSlugConfirmation / requestOrphanRebindConfirm without changing callers.
 */

export interface AdminWorkspaceDangerTarget {
  organizationId: string
  slug: string
  name?: string
  gitRemoteUrl?: string | null
  githubLinked?: boolean
}

export interface UseAdminWorkspaceDangerOptions {
  /** Called after a successful mutation (reload lists, etc.). */
  onAfterMutation?: () => void | Promise<void>
  /** Called after a successful workspace delete (e.g. navigate away). */
  onDeleted?: (workspace: AdminWorkspaceDangerTarget) => void | Promise<void>
}

function extractErrorMessage(error: unknown, fallback: string): string {
  const asRecordError = error as { data?: { message?: string }, message?: string }
  return asRecordError.data?.message || asRecordError.message || fallback
}

export function useAdminWorkspaceDanger(options: UseAdminWorkspaceDangerOptions = {}) {
  const actionError = ref<string | null>(null)

  async function runMutation(
    path: string,
    fetchOptions: { method: 'POST' | 'DELETE', body?: Record<string, unknown> },
  ): Promise<boolean> {
    actionError.value = null
    try {
      await $fetch(path, fetchOptions)
      await options.onAfterMutation?.()
      return true
    }
    catch (error) {
      actionError.value = extractErrorMessage(error, 'Action impossible.')
      return false
    }
  }

  /**
   * Ask the operator to echo `slug` (or folder name). Returns trimmed value or null.
   * Task 9: replace body with ConfirmActionDialog; keep this signature.
   */
  function requestSlugConfirmation(expected: string, label: string): string | null {
    const typed = window.prompt(`${label}\n\nTapez « ${expected} » pour confirmer.`)
    if (typed === null)
      return null
    if (typed.trim() !== expected) {
      actionError.value = `Confirmation incorrecte : attendu « ${expected} ».`
      return null
    }
    return typed.trim()
  }

  /**
   * Collect org id + folder-name echo for orphan rebind.
   * Task 9: replace prompts with dialogs; keep return shape.
   */
  function requestOrphanRebindConfirm(folderName: string): {
    organizationId: string
    confirmSlug: string
  } | null {
    const organizationId = window.prompt(
      `Réassocier le dossier « ${folderName} » à une organisation.\n\nID de l'organisation cible :`,
    )
    if (!organizationId?.trim())
      return null

    const confirmSlug = requestSlugConfirmation(
      folderName,
      'Confirmer la réassociation du dossier orphelin ?',
    )
    if (!confirmSlug)
      return null

    return {
      organizationId: organizationId.trim(),
      confirmSlug,
    }
  }

  async function resetHard(workspace: AdminWorkspaceDangerTarget): Promise<void> {
    const confirmSlug = requestSlugConfirmation(
      workspace.slug,
      'Réinitialiser le workspace sur origin ?',
    )
    if (!confirmSlug)
      return
    await runMutation(
      `/api/admin/workspaces/${workspace.organizationId}/reset-hard`,
      { method: 'POST', body: { confirmSlug } },
    )
  }

  async function invalidateIndex(workspace: AdminWorkspaceDangerTarget): Promise<void> {
    await runMutation(
      `/api/admin/workspaces/${workspace.organizationId}/invalidate-index`,
      { method: 'POST' },
    )
  }

  async function unlinkGithub(workspace: AdminWorkspaceDangerTarget): Promise<void> {
    await runMutation(
      `/api/admin/workspaces/${workspace.organizationId}/unlink-github`,
      { method: 'POST' },
    )
  }

  async function deleteWorkspace(workspace: AdminWorkspaceDangerTarget): Promise<void> {
    const confirmSlug = requestSlugConfirmation(
      workspace.slug,
      'Supprimer définitivement ce workspace ?',
    )
    if (!confirmSlug)
      return

    actionError.value = null
    try {
      await $fetch(`/api/admin/workspaces/${workspace.organizationId}`, {
        method: 'DELETE',
        body: { confirmSlug },
      })
      // Prefer onDeleted (e.g. navigate away) over a list reload that would 404 the row.
      if (options.onDeleted)
        await options.onDeleted(workspace)
      else
        await options.onAfterMutation?.()
    }
    catch (error) {
      actionError.value = extractErrorMessage(error, 'Action impossible.')
    }
  }

  async function rebindOrphan(folderName: string): Promise<void> {
    const confirm = requestOrphanRebindConfirm(folderName)
    if (!confirm)
      return

    await runMutation('/api/admin/workspaces/rebind', {
      method: 'POST',
      body: {
        organizationId: confirm.organizationId,
        folderName,
        confirmSlug: confirm.confirmSlug,
      },
    })
  }

  return {
    actionError,
    resetHard,
    invalidateIndex,
    unlinkGithub,
    deleteWorkspace,
    rebindOrphan,
    requestSlugConfirmation,
    requestOrphanRebindConfirm,
  }
}
