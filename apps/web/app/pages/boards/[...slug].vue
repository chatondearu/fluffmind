<script setup lang="ts">
import { $fetch } from 'ofetch'
import { FluffmindButton } from '@fluffmind/design-system/src/components'
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
  <main class="mx-auto max-w-6xl p-6">
    <NuxtLink to="/" class="text-sm text-primary hover:underline">← All notes</NuxtLink>

    <div v-if="error" class="mt-4 text-error">
      Board not found.
    </div>
    <template v-else-if="data && board">
      <div v-if="!isBoard" class="mt-4 rounded-lg border border-outline-variant p-4 text-on-surface-variant">
        This note is not a Kanban board (`kanban-plugin: board`).
        <NuxtLink :to="`/notes/${id}`" class="ml-1 text-primary hover:underline">
          Open as note
        </NuxtLink>
      </div>
      <template v-else>
        <div class="mb-4 mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 class="text-2xl font-semibold text-on-surface">
            {{ data.note.title }}
          </h1>
          <div class="flex items-center gap-2">
            <NuxtLink :to="`/notes/${id}`" class="text-sm text-primary hover:underline">
              Markdown view
            </NuxtLink>
            <FluffmindButton :disabled="saving || !dirty" @click="save">
              {{ saving ? 'Saving…' : dirty ? 'Save' : 'Saved' }}
            </FluffmindButton>
          </div>
        </div>

        <KanbanBoard v-model="board" />

        <p v-if="saveError" class="mt-3 text-sm text-error">
          {{ saveError }}
        </p>

        <section v-if="data.backlinks.length" class="mt-8 border-t border-outline-variant pt-4">
          <h2 class="mb-2 text-sm font-medium uppercase text-on-surface-variant">
            Linked from
          </h2>
          <ul class="flex flex-col gap-1">
            <li v-for="backlink in data.backlinks" :key="backlink.id">
              <NuxtLink :to="`/notes/${backlink.id}`" class="text-primary hover:underline">
                {{ backlink.title }}
              </NuxtLink>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </main>
</template>
