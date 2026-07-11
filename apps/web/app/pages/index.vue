<script setup lang="ts">
import { isKanbanBoard } from '@fluffmind/kanban'
import {
  FluffmindButton,
  FluffmindCard,
  FluffmindChip,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'
import type { NoteSummary } from '../../server/vault/index'

const { data, error, refresh, pending } = await useFetch<{ notes: NoteSummary[] }>('/api/notes', {
  key: 'vault-notes',
})
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
  <main class="md3-page">
    <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="md3-display-sm">
          Notes
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Toutes les pages de ton vault.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink to="/notes/new">
          <FluffmindButton>Nouvelle page</FluffmindButton>
        </NuxtLink>
        <NuxtLink to="/graph">
          <FluffmindButton variant="tonal">
            Graph
          </FluffmindButton>
        </NuxtLink>
      </div>
    </header>

    <FluffmindTextField
      v-model="search"
      type="search"
      placeholder="Rechercher une note…"
      class="mb-6 max-w-xl"
    />

    <p v-if="pending" class="md3-body-md text-on-surface-variant">
      Chargement…
    </p>

    <FluffmindCard v-else-if="error" padding="lg" variant="outlined">
      <p class="md3-body-md text-error">
        Impossible de charger les notes.
      </p>
      <FluffmindButton variant="outlined" class="mt-4" @click="refresh()">
        Réessayer
      </FluffmindButton>
    </FluffmindCard>

    <template v-else>
      <FluffmindCard v-if="filteredNotes.length > 0" padding="none">
        <ul class="divide-y divide-outline-variant">
          <li v-for="note in filteredNotes" :key="note.id">
            <NuxtLink
              :to="noteHref(note)"
              class="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-on-surface/5"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="md3-title-sm truncate">{{ note.title }}</span>
                <FluffmindChip v-if="isKanbanBoard(note.frontmatter)" size="sm">
                  Board
                </FluffmindChip>
              </span>
              <span
                v-if="formatDate(note.frontmatter.date)"
                class="shrink-0 md3-label-md"
              >
                {{ formatDate(note.frontmatter.date) }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </FluffmindCard>

      <FluffmindCard
        v-else-if="!search.trim()"
        padding="lg"
        variant="outlined"
        class="max-w-xl"
      >
        <p class="md3-body-md text-on-surface-variant">
          Aucune note pour l'instant.
        </p>
        <NuxtLink to="/notes/new" class="mt-4 inline-block">
          <FluffmindButton variant="outlined">
            Créer une page
          </FluffmindButton>
        </NuxtLink>
        <p v-if="authEnabled" class="mt-4 md3-body-md text-on-surface-variant">
          Ou lie un dépôt Git dans les
          <NuxtLink to="/settings/workspace" class="text-primary hover:underline">
            paramètres workspace
          </NuxtLink>.
        </p>
        <p v-else class="mt-4 md3-body-md text-on-surface-variant">
          Voir les
          <NuxtLink to="/settings" class="text-primary hover:underline">
            paramètres
          </NuxtLink>
          pour la sync Git et le mode multi-comptes.
        </p>
      </FluffmindCard>

      <p v-else class="md3-body-md text-on-surface-variant">
        Aucun résultat pour « {{ search.trim() }} ».
      </p>
    </template>
  </main>
</template>
