<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import type { BlockNode } from '../../types'

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

const editor = inject(blockEditorContextKey, null)
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  editor?.registerSurface(props.block.id, {
    focus: () => root.value?.focus(),
    getOffset: () => 0,
  })
})

onUnmounted(() => {
  editor?.unregisterSurface(props.block.id)
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('enter', 0)
    return
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault()
    emit('deleteBlock')
  }
}
</script>

<template>
  <div
    ref="root"
    class="flex items-center py-2 outline-none"
    role="separator"
    tabindex="0"
    @keydown="onKeydown"
    @focus="emit('focus')"
    @blur="emit('blur')"
  >
    <hr class="w-full border-0 border-t border-outline-variant">
  </div>
</template>
