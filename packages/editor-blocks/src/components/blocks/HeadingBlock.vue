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

const prefix = computed(() => '#'.repeat(Math.min(6, Math.max(1, props.block.level ?? 1))))

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
  <div class="flex items-start gap-2">
    <span class="shrink-0 font-mono text-xs text-on-surface-variant">{{ prefix }}</span>
    <textarea
      v-model="markdown"
      rows="2"
      class="min-w-0 flex-1 resize-y rounded border border-outline bg-surface p-2 font-mono text-sm text-on-surface"
      placeholder="Heading text…"
    />
  </div>
</template>
