<script setup lang="ts">
import { computed } from 'vue'

import { getBlockDefinition } from '../registry'
import { registerDefaultBlocks } from '../register-defaults'
import type { BlockNode } from '../types'

registerDefaultBlocks()

const props = defineProps<{
  block: BlockNode
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
}>()

const component = computed(() => {
  const def = getBlockDefinition(props.block.type)
  if (def) {
    return def.component
  }
  return getBlockDefinition('fallback')!.component
})

function onUpdate(next: BlockNode) {
  emit('update', next)
}
</script>

<template>
  <component :is="component" :block="block" @update="onUpdate" />
</template>
