<script setup lang="ts">
import { computed } from 'vue'

import { blocksToMarkdown } from '../../blocks-to-markdown'
import { parseMarkdownToDocument } from '../../document'
import type { BlockNode } from '../../types'

const props = defineProps<{
  block: BlockNode
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
}>()

const markdown = computed({
  get: () => blocksToMarkdown([props.block]),
  set: (value: string) => {
    const { blocks } = parseMarkdownToDocument(value)
    const parsed = blocks[0]
    if (parsed?.type === 'table') {
      emit('update', { ...parsed, id: props.block.id })
    }
  },
})
</script>

<template>
  <textarea
    v-model="markdown"
    rows="4"
    class="md3-field min-h-24 resize-y font-mono md3-body-md"
    placeholder="GFM table…"
  />
</template>
