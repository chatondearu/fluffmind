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
  <p class="md3-card-outlined p-3 md3-body-md text-on-surface-variant shadow-none">
    {{ label }}
  </p>
</template>
