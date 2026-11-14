<script setup lang="ts">
import {
  FluffmindCard,
  FluffmindChip,
  FluffmindSelect,
} from '@fluffmind/design-system/src/components'

type SyncMode = 'git-live' | 'mesh-live'

const props = withDefaults(defineProps<{
  workspaceId: string
  canManage?: boolean
}>(), {
  canManage: true,
})

const syncMode = ref<SyncMode>('git-live')
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const syncModeOptions = [
  { value: 'git-live' as const, label: 'Git-live (legacy)' },
  { value: 'mesh-live' as const, label: 'Mesh-live (opt-in)' },
]

async function loadSyncMode(): Promise<void> {
  if (!props.canManage)
    return

  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ syncMode: SyncMode }>('/api/workspaces/sync-mode', {
      query: { workspaceId: props.workspaceId },
    })
    syncMode.value = response.syncMode === 'mesh-live' ? 'mesh-live' : 'git-live'
  }
  catch (err) {
    const asRecord = err as { data?: { message?: string }, message?: string }
    error.value = asRecord.data?.message || asRecord.message || 'Impossible de charger le mode de sync.'
  }
  finally {
    loading.value = false
  }
}

async function onSyncModeChange(next: SyncMode): Promise<void> {
  if (!props.canManage || next === syncMode.value)
    return

  saving.value = true
  error.value = null
  success.value = null
  const previous = syncMode.value
  syncMode.value = next

  try {
    const response = await $fetch<{ syncMode: SyncMode, previousSyncMode: SyncMode }>(
      '/api/workspaces/sync-mode',
      {
        method: 'PATCH',
        body: {
          workspaceId: props.workspaceId,
          syncMode: next,
        },
      },
    )
    syncMode.value = response.syncMode
    success.value = response.syncMode === 'mesh-live'
      ? 'Mode mesh-live activé. Git reste export/backup uniquement. Pour revenir en arrière, choisissez Git-live.'
      : 'Mode git-live restauré (rollback).'
  }
  catch (err) {
    syncMode.value = previous
    const asRecord = err as { data?: { message?: string }, message?: string }
    error.value = asRecord.data?.message || asRecord.message || 'Impossible de changer le mode de sync.'
  }
  finally {
    saving.value = false
  }
}

watch(() => props.workspaceId, () => {
  void loadSyncMode()
}, { immediate: true })
</script>

<template>
  <FluffmindCard padding="lg" class="mb-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="md3-title-md">
        Mode de sync live
      </h2>
      <FluffmindChip variant="outlined">
        {{ syncMode === 'mesh-live' ? 'mesh-live' : 'git-live' }}
      </FluffmindChip>
    </div>

    <p class="mb-4 md3-body-md text-on-surface-variant">
      Un seul writer live à la fois (git-live <em>ou</em> mesh-live).
      En mesh-live, Git reste disponible pour export / backup / GitHub, pas pour
      les sauvegardes de notes. Rollback : repassez sur git-live.
      Sans auth (<code>AUTH_DISABLED=true</code>), utilisez l’env <code>SYNC_MODE</code>.
    </p>

    <label v-if="canManage" class="block max-w-md">
      <span class="mb-2 block md3-label-lg">Mode</span>
      <FluffmindSelect
        :model-value="syncMode"
        :options="syncModeOptions"
        :disabled="loading || saving"
        @update:model-value="onSyncModeChange($event as SyncMode)"
      />
    </label>
    <p v-else class="md3-body-sm text-on-surface-variant">
      Réservé au propriétaire du workspace.
    </p>

    <p v-if="error" class="mt-3 md3-body-sm text-error">
      {{ error }}
    </p>
    <p v-else-if="success" class="mt-3 md3-body-sm text-primary">
      {{ success }}
    </p>
  </FluffmindCard>
</template>
