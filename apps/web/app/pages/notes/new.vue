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
const editorRef = ref<{ confirmInlinePrompt: (value: string | null) => void } | null>(null)
const inlinePromptOpen = ref(false)
const inlinePromptKind = ref<'link' | 'wikilink'>('link')

const inlinePromptTitle = computed(() =>
  inlinePromptKind.value === 'link' ? 'URL du lien' : 'Cible du wikilink',
)
const inlinePromptPlaceholder = computed(() =>
  inlinePromptKind.value === 'link' ? 'https://…' : 'chemin de la note',
)

function onInlinePrompt(payload: { kind: 'link' | 'wikilink' }) {
  inlinePromptKind.value = payload.kind
  inlinePromptOpen.value = true
}

function onInlinePromptConfirm(value: string) {
  editorRef.value?.confirmInlinePrompt(value)
}

watch(inlinePromptOpen, (open) => {
  if (!open) {
    // Closing without confirm still settles the pending Promise.
    // confirmInlinePrompt is idempotent when already settled by submit.
    editorRef.value?.confirmInlinePrompt(null)
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
      ref="editorRef"
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
