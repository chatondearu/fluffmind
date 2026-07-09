<script setup lang="ts">
import type { BlockNode } from '../../types'

const props = defineProps<{
  block: BlockNode
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
}>()

function updateText(value: string) {
  emit('update', { ...props.block, text: value })
}
</script>

<template>
  <textarea
    :value="block.text ?? ''"
    rows="6"
    class="w-full resize-y rounded border border-outline bg-surface-container-low p-2 font-mono text-sm text-on-surface"
    placeholder="Code…"
    @input="updateText(($event.target as HTMLTextAreaElement).value)"
  />
</template>
