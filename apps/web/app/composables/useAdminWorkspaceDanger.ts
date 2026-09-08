/**
 * Shared danger-zone mutations for instance-admin workspace ops.
 * Destructive confirms use ConfirmActionDialog (mounted by the caller).
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

export interface AdminConfirmActionState {
  open: boolean
  title: string
  description: string
  confirmValue: string
  confirmLabel: string
  inputLabel: string
}

export interface AdminPromptDialogState {
  open: boolean
  title: string
  description: string
  placeholder: string
  confirmLabel: string
  initialValue: string
}

function extractErrorMessage(error: unknown, fallback: string): string {
  const asRecordError = error as { data?: { message?: string }, message?: string }
  return asRecordError.data?.message || asRecordError.message || fallback
}

export function useAdminWorkspaceDanger(options: UseAdminWorkspaceDangerOptions = {}) {
  const actionError = ref<string | null>(null)

  const confirmAction = reactive<AdminConfirmActionState>({
    open: false,
    title: '',
    description: '',
    confirmValue: '',
    confirmLabel: 'Confirmer',
    inputLabel: '',
  })

  const promptDialog = reactive<AdminPromptDialogState>({
    open: false,
    title: '',
    description: '',
    placeholder: '',
    confirmLabel: 'Valider',
    initialValue: '',
  })

  let confirmResolve: ((value: string | null) => void) | null = null
  let promptResolve: ((value: string | null) => void) | null = null

  watch(() => confirmAction.open, (isOpen) => {
    if (!isOpen && confirmResolve) {
      const resolve = confirmResolve
      confirmResolve = null
      resolve(null)
    }
  })

  watch(() => promptDialog.open, (isOpen) => {
    if (!isOpen && promptResolve) {
      const resolve = promptResolve
      promptResolve = null
      resolve(null)
    }
  })

  function onConfirmAction(): void {
    if (!confirmResolve)
      return
    const resolve = confirmResolve
    confirmResolve = null
    const value = confirmAction.confirmValue
    confirmAction.open = false
    resolve(value)
  }

  function onPromptConfirm(value: string): void {
    if (!promptResolve)
      return
    const resolve = promptResolve
    promptResolve = null
    promptDialog.open = false
    resolve(value.trim() || null)
  }

  /**
   * Ask the operator to echo `slug` (or folder name). Returns trimmed value or null.
   */
  function requestSlugConfirmation(expected: string, label: string): Promise<string | null> {
    return new Promise((resolve) => {
      confirmResolve = resolve
      confirmAction.title = 'Confirmation requise'
      confirmAction.description = `${label} Tapez « ${expected} » pour confirmer.`
      confirmAction.confirmValue = expected
      confirmAction.confirmLabel = 'Confirmer'
      confirmAction.inputLabel = `Tapez « ${expected} »`
      confirmAction.open = true
    })
  }

  /**
   * Collect org id + folder-name echo for orphan rebind.
   */
  async function requestOrphanRebindConfirm(folderName: string): Promise<{
    organizationId: string
    confirmSlug: string
  } | null> {
    const organizationId = await new Promise<string | null>((resolve) => {
      promptResolve = resolve
      promptDialog.title = 'Réassocier un dossier orphelin'
      promptDialog.description = `Réassocier le dossier « ${folderName} » à une organisation.`
      promptDialog.placeholder = 'ID de l\'organisation cible'
      promptDialog.confirmLabel = 'Continuer'
      promptDialog.initialValue = ''
      promptDialog.open = true
    })
    if (!organizationId)
      return null

    const confirmSlug = await requestSlugConfirmation(
      folderName,
      'Confirmer la réassociation du dossier orphelin ?',
    )
    if (!confirmSlug)
      return null

    return {
      organizationId,
      confirmSlug,
    }
  }

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

  async function resetHard(workspace: AdminWorkspaceDangerTarget): Promise<void> {
    const confirmSlug = await requestSlugConfirmation(
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
    const confirmSlug = await requestSlugConfirmation(
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
    const confirm = await requestOrphanRebindConfirm(folderName)
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
    confirmAction,
    onConfirmAction,
    promptDialog,
    onPromptConfirm,
    resetHard,
    invalidateIndex,
    unlinkGithub,
    deleteWorkspace,
    rebindOrphan,
    requestSlugConfirmation,
    requestOrphanRebindConfirm,
  }
}
