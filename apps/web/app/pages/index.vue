<script setup lang="ts">
import { isKanbanBoard } from '@fluffmind/kanban'
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import type { NoteSummary } from '../../server/vault/index'

const { data, error, refresh, pending } = await useFetch<{ notes: NoteSummary[] }>('/api/notes')
const notes = computed(() => data.value?.notes ?? [])
const { public: { authEnabled } } = useRuntimeConfig()

const search = ref('')

const filteredNotes = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return notes.value
  return notes.value.filter((note) => {
    const tags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags.join(' ') : ''
    return `${note.title} ${tags}`.toLowerCase().includes(query)
  })
})

function formatDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return typeof value === 'string' ? value : null
}

function noteHref(note: NoteSummary): string {
  if (isKanbanBoard(note.frontmatter)) {
    return `/boards/${note.id}`
  }
  return `/notes/${note.id}`
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-6">
    <div class="mb-4 flex items-baseline justify-between gap-4">
      <h1 class="text-2xl font-semibold text-on-surface">Fluffmind</h1>
      <div class="flex items-center gap-3">
        <NuxtLink to="/notes/new">
          <FluffmindButton>Nouvelle page</FluffmindButton>
        </NuxtLink>
        <NuxtLink to="/graph" class="text-sm text-primary hover:underline">Graph →</NuxtLink>
      </div>
    </div>
    <input
      v-model="search"
      type="search"
      placeholder="Search notes…"
      class="mb-4 w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
    >
    <p v-if="pending" class="mb-4 text-sm text-on-surface-variant">
      Loading notes…
    </p>
    <div v-else-if="error" class="mb-4 rounded-lg border border-outline-variant p-4">
      <p class="text-sm text-error">
        Failed to load notes.
      </p>
      <FluffmindButton variant="outlined" class="mt-3" @click="refresh()">
        Retry
      </FluffmindButton>
    </div>
    <template v-else>
    <ul class="flex flex-col gap-1">
      <li v-for="note in filteredNotes" :key="note.id">
        <NuxtLink :to="noteHref(note)" class="flex items-baseline justify-between rounded-lg px-3 py-2 hover:bg-primary/10">
          <span class="flex items-center gap-2 font-medium text-on-surface">
            {{ note.title }}
            <span
              v-if="isKanbanBoard(note.frontmatter)"
              class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary"
            >
              Board
            </span>
          </span>
          <span v-if="formatDate(note.frontmatter.date)" class="text-sm text-on-surface-variant">{{ formatDate(note.frontmatter.date) }}</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-if="filteredNotes.length === 0 && !search.trim()" class="rounded-lg border border-dashed border-outline-variant p-6 text-on-surface-variant">
      Aucune note pour l'instant.
      <NuxtLink to="/notes/new" class="mt-3 inline-block">
        <FluffmindButton variant="outlined">
          Créer une page
        </FluffmindButton>
      </NuxtLink>
      <span v-if="authEnabled" class="mt-2 block text-sm">
        Or link a Git remote in
        <NuxtLink to="/settings/workspace" class="text-primary hover:underline">workspace settings</NuxtLink>.
      </span>
      <span v-else class="mt-2 block text-sm">
        See
        <NuxtLink to="/settings" class="text-primary hover:underline">settings</NuxtLink>
        for Git sync and multi-account setup.
      </span>
    </p>
    <p v-else-if="filteredNotes.length === 0" class="text-on-surface-variant">
      No notes match your search.
    </p>
    </template>
  </main>
</template>
