<script setup lang="ts">
import { computed } from 'vue'

import { inlinesToMarkdown } from '../../inlines'
import type { BlockNode } from '../../types'

const props = defineProps<{
  block: BlockNode
}>()

const label = computed(() => inlinesToMarkdown(props.block.inlines ?? []) || props.block.raw || 'Unsupported block')
</script>

<template>
  <p class="rounded border border-dashed border-outline-variant p-2 text-sm text-on-surface-variant">
    {{ label }}
  </p>
</template>
