<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import type { ThemePreference } from './composables/useTheme'

const { preference, setPreference } = useTheme()

const CYCLE: ThemePreference[] = ['system', 'light', 'dark']

function cycleTheme() {
  const next = CYCLE[(CYCLE.indexOf(preference.value) + 1) % CYCLE.length]!
  setPreference(next)
}
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface">
    <NuxtRouteAnnouncer />
    <FluffmindButton variant="text" class="fixed right-4 top-4 z-10" @click="cycleTheme">
      Theme: {{ preference }}
    </FluffmindButton>
    <NuxtPage />
  </div>
</template>
