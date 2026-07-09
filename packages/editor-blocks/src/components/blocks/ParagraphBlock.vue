<script setup lang="ts">
import { computed } from 'vue'

import { inlinesToMarkdown, parseInlineMarkdown } from '../../inlines'
import type { BlockNode } from '../../types'

const props = defineProps<{
  block: BlockNode
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
}>()

const markdown = computed({
  get: () => inlinesToMarkdown(props.block.inlines ?? []),
  set: (value: string) => {
    emit('update', {
      ...props.block,
      inlines: parseInlineMarkdown(value),
    })
  },
})
</script>

<template>
  <textarea
    v-model="markdown"
    rows="3"
    class="w-full resize-y rounded border border-outline bg-surface p-2 font-mono text-sm text-on-surface"
    placeholder="Paragraph (markdown)…"
  />
</template>
