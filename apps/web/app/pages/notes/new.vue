<script setup lang="ts">
import { createEmptyBlock, BlockEditor } from '@fluffmind/editor-blocks'
import type { BlockNode } from '@fluffmind/editor-blocks'

import { displayTitleFromBlocks, useNoteAutosave } from '../../composables/useNoteAutosave'

const noteId = ref('new')
const isNew = ref(true)
const blocks = ref<BlockNode[]>([createEmptyBlock('paragraph')])

const title = computed(() => displayTitleFromBlocks(blocks.value))

const { status, errorMessage } = useNoteAutosave({
  noteId,
  blocks,
  isNew,
  async onCreated(id) {
    await navigateTo(`/notes/${id}`, { replace: true })
  },
})
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-8">
    <div class="mb-6 flex items-center justify-between gap-4">
      <NuxtLink to="/" class="text-sm text-on-surface-variant hover:text-primary">
        ← Notes
      </NuxtLink>
      <span class="text-xs text-on-surface-variant">
        <template v-if="status === 'saving'">Enregistrement…</template>
        <template v-else-if="status === 'saved'">Enregistré</template>
        <template v-else-if="status === 'error'">Erreur</template>
      </span>
    </div>

    <h1 class="mb-4 text-3xl font-bold text-on-surface">
      {{ title }}
    </h1>

    <BlockEditor v-model="blocks" />

    <p v-if="errorMessage" class="mt-4 text-sm text-error">
      {{ errorMessage }}
    </p>
  </main>
</template>
