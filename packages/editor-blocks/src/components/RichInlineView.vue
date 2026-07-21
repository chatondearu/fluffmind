<script setup lang="ts">
import { computed } from 'vue'

import { inlinesToPlainText } from '../inlines'
import type { InlineNode } from '../types'
import RichInlineNodes from './RichInlineNodes.vue'

const props = withDefaults(defineProps<{
  inlines: InlineNode[]
  placeholder?: string
  textClass?: string
}>(), {
  placeholder: '',
  textClass: 'md3-body-md',
})

const emit = defineEmits<{
  activate: []
}>()

const isEmpty = computed(() => inlinesToPlainText(props.inlines).length === 0)

function onSurfaceClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a')) return
  emit('activate')
}
</script>

<template>
  <div
    class="rich-inline min-w-0 w-full cursor-text whitespace-pre-wrap break-words outline-none"
    :class="[textClass, { 'is-empty': isEmpty }]"
    :data-placeholder="placeholder"
    role="presentation"
    @click="onSurfaceClick"
  >
    <RichInlineNodes v-if="!isEmpty" :inlines="inlines" />
  </div>
</template>

<style scoped>
.rich-inline.is-empty:empty::before,
.rich-inline.is-empty::before {
  content: attr(data-placeholder);
  color: var(--md-on-surface-variant, #6b7280);
  pointer-events: none;
}
.rich-inline.is-empty:not(:empty)::before {
  content: none;
}
</style>
