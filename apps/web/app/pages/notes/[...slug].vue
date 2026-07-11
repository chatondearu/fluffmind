<script setup lang="ts">
import { isKanbanBoard } from '@fluffmind/kanban'
import { BlockEditor, createEmptyBlock, parseMarkdownToDocument } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'
import type { NoteSummary, ResolvedLink } from '../../../server/vault/index'

import { displayTitleFromBlocks, useNoteAutosave } from '../../composables/useNoteAutosave'

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

const { data, error } = await useFetch<NoteDetailResponse>(() => `/api/notes/${id.value}`)

watch(
  data,
  (value) => {
    if (value?.note.frontmatter && isKanbanBoard(value.note.frontmatter)) {
      navigateTo(`/boards/${id.value}`, { replace: true })
    }
  },
  { immediate: true },
)

const noteId = ref(id.value)
const isNew = ref(false)
const blocks = ref<BlockNode[]>([createEmptyBlock('paragraph')])
const initialized = ref(false)

watch(
  data,
  (value) => {
    if (!value || initialized.value) return
    const parsed = parseMarkdownToDocument(value.note.content).blocks
    blocks.value = parsed.length > 0 ? parsed : [createEmptyBlock('paragraph')]
    initialized.value = true
  },
  { immediate: true },
)

const title = computed(() => data.value?.note.title || displayTitleFromBlocks(blocks.value))

const { status, errorMessage } = useNoteAutosave({
  noteId,
  blocks,
  isNew,
  async onCreated(createdId) {
    await navigateTo(`/notes/${createdId}`, { replace: true })
  },
})
</script>

<template>
  <main class="md3-page max-w-3xl">
    <div class="mb-6 flex items-center justify-end gap-4">
      <span class="md3-label-md">
        <template v-if="status === 'saving'">Enregistrement…</template>
        <template v-else-if="status === 'saved'">Enregistré</template>
        <template v-else-if="status === 'error'">Erreur</template>
      </span>
    </div>

    <div v-if="error" class="text-error">
      Note introuvable.
    </div>

    <template v-else-if="data">
      <h1 class="mb-6 md3-display-sm">
        {{ title }}
      </h1>

      <BlockEditor v-model="blocks" />

      <p v-if="errorMessage" class="mt-4 text-sm text-error">
        {{ errorMessage }}
      </p>

      <section v-if="data.backlinks.length" class="mt-10 border-t border-outline-variant pt-6">
        <h2 class="mb-3 md3-label-lg uppercase tracking-wide">
          Liens entrants
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
  </main>
</template>
