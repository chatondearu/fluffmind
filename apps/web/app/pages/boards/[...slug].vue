<script setup lang="ts">
import { $fetch } from 'ofetch'
import {
  FluffmindButton,
  FluffmindCard,
} from '@fluffmind/design-system/src/components'
import {
  isKanbanBoard,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
} from '@fluffmind/kanban'
import type { KanbanBoard as KanbanBoardModel } from '@fluffmind/kanban'
import type { NoteSummary, ResolvedLink } from '../../../server/vault/index'

interface NoteDetailResponse {
  note: { id: string, title: string, frontmatter: Record<string, unknown>, content: string, html: string }
  links: ResolvedLink[]
  backlinks: NoteSummary[]
}

const route = useRoute()
const id = computed(() => {
  const slug = route.params.slug
  return Array.isArray(slug) ? slug.join('/') : String(slug)
})

const { data, error, refresh } = await useFetch<NoteDetailResponse>(() => `/api/notes/${id.value}`)

const board = ref<KanbanBoardModel | null>(null)
const savedSnapshot = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)

watch(
  data,
  (value) => {
    if (!value?.note) {
      board.value = null
      savedSnapshot.value = ''
      return
    }
    board.value = parseKanbanMarkdown(value.note.content)
    savedSnapshot.value = serializeKanbanMarkdown(board.value)
    saveError.value = null
  },
  { immediate: true },
)

const dirty = computed(() => {
  if (!board.value) return false
  return serializeKanbanMarkdown(board.value) !== savedSnapshot.value
})

const isBoard = computed(() => {
  const frontmatter = data.value?.note.frontmatter
  return Boolean(frontmatter && isKanbanBoard(frontmatter))
})

function extractErrorMessage(err: unknown): string {
  const asRecord = err as { data?: { message?: string, statusMessage?: string }, statusMessage?: string }
  return asRecord?.data?.message ?? asRecord?.data?.statusMessage ?? asRecord?.statusMessage ?? 'Save failed.'
}

async function save() {
  if (!board.value) return
  saving.value = true
  saveError.value = null
  try {
    const content = serializeKanbanMarkdown(board.value)
    await $fetch(`/api/notes/${id.value}`, { method: 'PUT', body: { content } })
    savedSnapshot.value = content
    await refresh()
  } catch (err) {
    saveError.value = extractErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="md3-page max-w-6xl">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 v-if="data" class="md3-display-sm">
          {{ data.note.title }}
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Vue Kanban
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink to="/">
          <FluffmindButton variant="tonal" size="sm">
            ← Notes
          </FluffmindButton>
        </NuxtLink>
        <NuxtLink v-if="data" :to="`/notes/${id}`">
          <FluffmindButton variant="text" size="sm">
            Markdown view
          </FluffmindButton>
        </NuxtLink>
        <FluffmindButton v-if="isBoard" :disabled="saving || !dirty" @click="save">
          {{ saving ? 'Saving…' : dirty ? 'Save' : 'Saved' }}
        </FluffmindButton>
      </div>
    </header>

    <div v-if="error" class="md3-body-md text-error">
      Board not found.
    </div>

    <template v-else-if="data && board">
      <FluffmindCard v-if="!isBoard" padding="lg" variant="outlined" class="mb-6">
        <p class="md3-body-md text-on-surface-variant">
          This note is not a Kanban board (`kanban-plugin: board`).
        </p>
        <NuxtLink :to="`/notes/${id}`" class="mt-4 inline-block">
          <FluffmindButton variant="outlined" size="sm">
            Open as note
          </FluffmindButton>
        </NuxtLink>
      </FluffmindCard>

      <template v-else>
        <KanbanBoard v-model="board" />

        <p v-if="saveError" class="mt-4 md3-body-md text-error">
          {{ saveError }}
        </p>

        <section v-if="data.backlinks.length" class="mt-10 border-t border-outline-variant pt-6">
          <h2 class="mb-3 md3-label-lg uppercase tracking-wide">
            Linked from
          </h2>
          <ul class="flex flex-col gap-1">
            <li v-for="backlink in data.backlinks" :key="backlink.id">
              <NuxtLink :to="`/notes/${backlink.id}`" class="md3-body-md text-primary hover:underline">
                {{ backlink.title }}
              </NuxtLink>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </main>
</template>
