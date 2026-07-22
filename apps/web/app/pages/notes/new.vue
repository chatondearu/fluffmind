<script setup lang="ts">
import { BlockEditor, createEmptyBlock, stripTrailingEmptyBlocks } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'

import { sanitizeFolderFromQuery } from '../../utils/note-document'

const route = useRoute()
const folderPrefix = computed(() => sanitizeFolderFromQuery(route.query.folder))

const noteId = ref('new')
const isNew = ref(true)
const title = ref('Sans titre')
const blocks = ref<BlockNode[]>([createEmptyBlock('paragraph')])
const inlinePromptOpen = ref(false)
const inlinePromptKind = ref<'link' | 'wikilink'>('link')
let inlinePromptConfirm: ((value: string | null) => void) | null = null

const inlinePromptTitle = computed(() =>
  inlinePromptKind.value === 'link' ? 'URL du lien' : 'Cible du wikilink',
)
const inlinePromptPlaceholder = computed(() =>
  inlinePromptKind.value === 'link' ? 'https://…' : 'chemin de la note',
)

function onInlinePrompt(payload: {
  kind: 'link' | 'wikilink'
  confirm: (value: string | null) => void
}) {
  inlinePromptKind.value = payload.kind
  inlinePromptConfirm = payload.confirm
  inlinePromptOpen.value = true
}

function onInlinePromptConfirm(value: string) {
  inlinePromptConfirm?.(value)
}

watch(inlinePromptOpen, (open) => {
  if (!open) {
    // Closing without confirm still settles the pending Promise.
    // The controller ignores this when submit already settled the request.
    inlinePromptConfirm?.(null)
    inlinePromptConfirm = null
  }
})

const { status, errorMessage } = useNoteAutosave({
  noteId,
  title,
  blocks,
  isNew,
  folderPrefix,
  async onCreated(id) {
    await navigateTo(`/notes/${id}`, { replace: true })
  },
})

onBeforeUnmount(() => {
  blocks.value = stripTrailingEmptyBlocks(blocks.value)
})
</script>

<template>
  <main class="md3-page max-w-3xl">
    <div class="mb-6 flex items-center justify-end gap-4">
      <span class="md3-label-md">
        <template v-if="folderPrefix">
          Dossier : {{ folderPrefix }} ·
        </template>
        <template v-if="status === 'saving'">Enregistrement…</template>
        <template v-else-if="status === 'saved'">Enregistré</template>
        <template v-else-if="status === 'error'">Erreur</template>
      </span>
    </div>

    <NoteTitleField v-model="title" />

    <BlockEditor
      v-model="blocks"
      @inline-prompt="onInlinePrompt"
    />

    <p v-if="errorMessage" class="mt-4 text-sm text-error">
      {{ errorMessage }}
    </p>

    <PromptDialog
      v-model:open="inlinePromptOpen"
      :title="inlinePromptTitle"
      :placeholder="inlinePromptPlaceholder"
      @confirm="onInlinePromptConfirm"
    />
  </main>
</template>
