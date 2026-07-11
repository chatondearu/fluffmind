<script setup lang="ts">
import { BlockEditor, createEmptyBlock } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'

import { sanitizeFolderFromQuery } from '../../utils/note-document'

const route = useRoute()
const folderPrefix = computed(() => sanitizeFolderFromQuery(route.query.folder))

const noteId = ref('new')
const isNew = ref(true)
const title = ref('Sans titre')
const blocks = ref<BlockNode[]>([createEmptyBlock('paragraph')])

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

    <BlockEditor v-model="blocks" />

    <p v-if="errorMessage" class="mt-4 text-sm text-error">
      {{ errorMessage }}
    </p>
  </main>
</template>
