<script setup lang="ts">
import { computed } from 'vue'

import { getBlockDefinition } from '../registry'
import { registerDefaultBlocks } from '../register-defaults'
import type { BlockNode } from '../types'

registerDefaultBlocks()

const props = defineProps<{
  block: BlockNode
  index: number
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
  enter: [offset: number]
  shiftEnter: [offset: number]
  backspaceEmpty: []
  deleteBlock: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
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
  <component
    :is="component"
    :block="block"
    :index="index"
    @update="onUpdate"
    @enter="emit('enter', $event)"
    @shift-enter="emit('shiftEnter', $event)"
    @backspace-empty="emit('backspaceEmpty')"
    @delete-block="emit('deleteBlock')"
    @slash-change="emit('slashChange', $event)"
    @blur="emit('blur')"
    @focus="emit('focus')"
  />
</template>
