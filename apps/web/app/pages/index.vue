<script setup lang="ts">
import { $fetch } from 'ofetch'
import { FluffmindButton } from '@fluffmind/design-system/src/components'
import type { NoteSummary } from '../../server/vault/index'

const { data, refresh } = await useFetch<{ notes: NoteSummary[] }>('/api/notes')
const notes = computed(() => data.value?.notes ?? [])

const search = ref('')
const showCreateForm = ref(false)
const newNoteId = ref('')
const newNoteContent = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

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

function defaultContentForId(id: string): string {
  const title = id.split('/').pop()?.replace(/-/g, ' ') ?? 'New note'
  return `# ${title}\n\n`
}

function openCreateForm() {
  newNoteId.value = ''
  newNoteContent.value = ''
  createError.value = null
  showCreateForm.value = true
}

function extractErrorMessage(err: unknown): string {
  const asRecord = err as { data?: { message?: string, statusMessage?: string }, statusMessage?: string }
  return asRecord?.data?.statusMessage ?? asRecord?.data?.message ?? asRecord?.statusMessage ?? 'Create failed.'
}

async function createNote() {
  const id = newNoteId.value.trim()
  if (!id) {
    createError.value = 'Note id is required.'
    return
  }

  creating.value = true
  createError.value = null
  try {
    const content = newNoteContent.value || defaultContentForId(id)
    await $fetch('/api/notes', { method: 'POST', body: { id, content } })
    await refresh()
    showCreateForm.value = false
    await navigateTo(`/notes/${id}`)
  } catch (err) {
    createError.value = extractErrorMessage(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-6">
    <div class="mb-4 flex items-baseline justify-between gap-4">
      <h1 class="text-2xl font-semibold text-on-surface">Fluffmind</h1>
      <div class="flex items-center gap-3">
        <FluffmindButton v-if="!showCreateForm" variant="outlined" @click="openCreateForm">
          New note
        </FluffmindButton>
        <NuxtLink to="/graph" class="text-sm text-primary hover:underline">Graph →</NuxtLink>
      </div>
    </div>
    <section v-if="showCreateForm" class="mb-4 rounded-lg border border-outline p-4">
      <h2 class="mb-3 text-sm font-medium text-on-surface">
        New note
      </h2>
      <label class="mb-3 block">
        <span class="mb-1 block text-sm text-on-surface-variant">Id (e.g. projets/my-note)</span>
        <input
          v-model="newNoteId"
          type="text"
          placeholder="folder/my-note"
          class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-on-surface"
        >
      </label>
      <label class="mb-3 block">
        <span class="mb-1 block text-sm text-on-surface-variant">Content (optional)</span>
        <textarea
          v-model="newNoteContent"
          rows="6"
          :placeholder="defaultContentForId(newNoteId.trim() || 'new-note')"
          class="w-full rounded-lg border border-outline bg-surface px-3 py-2 font-mono text-sm text-on-surface"
        />
      </label>
      <p v-if="createError" class="mb-3 text-sm text-error">
        {{ createError }}
      </p>
      <div class="flex gap-2">
        <FluffmindButton :disabled="creating" @click="createNote">
          {{ creating ? 'Creating…' : 'Create' }}
        </FluffmindButton>
        <FluffmindButton variant="outlined" :disabled="creating" @click="showCreateForm = false">
          Cancel
        </FluffmindButton>
      </div>
    </section>
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
