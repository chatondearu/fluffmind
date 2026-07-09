<script setup lang="ts">
import { $fetch } from 'ofetch'
import { FluffmindButton } from '@fluffmind/design-system/src/components'

interface SyncStatus {
  remoteConfigured: boolean
  branch: string
  ahead: number
  behind: number
  diverged: boolean
}

const { data, refresh, pending } = await useFetch<SyncStatus>('/api/sync-status')

const pulling = ref(false)
const pullError = ref<string | null>(null)

const visible = computed(() => data.value?.remoteConfigured === true)

const statusLabel = computed(() => {
  const status = data.value
  if (!status) return ''
  if (status.behind > 0 && status.ahead > 0) {
    return `${status.behind} behind · ${status.ahead} ahead`
  }
  if (status.behind > 0) return `${status.behind} behind`
  if (status.ahead > 0) return `${status.ahead} ahead`
  return 'Up to date'
})

const statusTone = computed(() => {
  const status = data.value
  if (!status) return 'text-on-surface-variant'
  if (status.behind > 0) return 'text-error'
  if (status.ahead > 0) return 'text-on-surface-variant'
  return 'text-primary'
})

async function pullLatest() {
  pulling.value = true
  pullError.value = null
  try {
    await $fetch('/api/sync/pull', { method: 'POST' })
    await refresh()
    await refreshNuxtData()
  } catch (error) {
    const asRecord = error as { data?: { message?: string }, statusMessage?: string, message?: string }
    pullError.value = asRecord.data?.message ?? asRecord.statusMessage ?? asRecord.message ?? 'Pull failed.'
  } finally {
    pulling.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="flex flex-col items-end gap-1">
    <div class="flex items-center gap-2 text-xs">
      <span :class="statusTone">
        {{ pending ? 'Checking sync…' : statusLabel }}
      </span>
      <FluffmindButton
        v-if="(data?.behind ?? 0) > 0"
        variant="outlined"
        :disabled="pulling || pending"
        @click="pullLatest"
      >
        {{ pulling ? 'Pulling…' : 'Pull' }}
      </FluffmindButton>
      <button
        v-else
        type="button"
        class="rounded px-1 text-on-surface-variant hover:text-primary"
        title="Refresh sync status"
        :disabled="pending"
        @click="refresh()"
      >
        ↻
      </button>
    </div>
    <p v-if="pullError" class="max-w-xs text-right text-xs text-error">
      {{ pullError }}
    </p>
  </div>
</template>
