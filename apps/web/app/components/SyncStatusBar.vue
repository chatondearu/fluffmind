<script setup lang="ts">
import { $fetch } from 'ofetch'
import {
  FluffmindButton,
  FluffmindChip,
  FluffmindIconButton,
  FluffmindTooltip,
} from '@fluffmind/design-system/src/components'

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

const statusVariant = computed<'filled' | 'outlined'>(() => {
  const status = data.value
  if (!status) return 'outlined'
  if (status.behind > 0) return 'filled'
  if (status.ahead > 0) return 'outlined'
  return 'filled'
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
    <div class="flex items-center gap-2">
      <FluffmindChip
        :variant="statusVariant"
        size="sm"
        :class="(data?.behind ?? 0) > 0 ? 'bg-error-container text-on-error-container' : ''"
      >
        {{ pending ? 'Checking sync…' : statusLabel }}
      </FluffmindChip>
      <FluffmindButton
        v-if="(data?.behind ?? 0) > 0"
        variant="outlined"
        size="sm"
        :disabled="pulling || pending"
        @click="pullLatest"
      >
        {{ pulling ? 'Pulling…' : 'Pull' }}
      </FluffmindButton>
      <FluffmindTooltip v-else text="Refresh sync status">
        <FluffmindIconButton
          label="Refresh sync status"
          size="sm"
          :disabled="pending"
          @click="refresh()"
        >
          ↻
        </FluffmindIconButton>
      </FluffmindTooltip>
    </div>
    <p v-if="pullError" class="max-w-xs text-right md3-label-md text-error">
      {{ pullError }}
    </p>
  </div>
</template>
