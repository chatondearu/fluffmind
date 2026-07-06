<script setup lang="ts">
import type { NoteSummary } from '../../server/vault/index'

const { data } = await useFetch<{ notes: NoteSummary[] }>('/api/notes')
const notes = computed(() => data.value?.notes ?? [])

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
</script>

<template>
  <main class="mx-auto max-w-2xl p-6">
    <h1 class="mb-4 text-2xl font-semibold text-on-surface">Fluffmind</h1>
    <input
      v-model="search"
      type="search"
      placeholder="Search notes…"
      class="mb-4 w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
    >
    <ul class="flex flex-col gap-1">
      <li v-for="note in filteredNotes" :key="note.id">
        <NuxtLink :to="`/notes/${note.id}`" class="flex items-baseline justify-between rounded-lg px-3 py-2 hover:bg-primary/10">
          <span class="font-medium text-on-surface">{{ note.title }}</span>
          <span v-if="formatDate(note.frontmatter.date)" class="text-sm text-on-surface-variant">{{ formatDate(note.frontmatter.date) }}</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-if="filteredNotes.length === 0" class="text-on-surface-variant">
      No notes found.
    </p>
  </main>
</template>
