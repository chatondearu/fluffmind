<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockPlainText, setBlockPlainText } from '../../block-text'
import { blockEditorContextKey } from '../../block-editor-context'
import type { BlockNode } from '../../types'
import EditableSurface from '../EditableSurface.vue'

const props = defineProps<{
  block: BlockNode
  index: number
}>()

const emit = defineEmits<{
  update: [block: BlockNode]
  enter: [offset: number]
  shiftEnter: [offset: number]
  tab: []
  shiftTab: []
  backspaceEmpty: []
  deleteBlock: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
}>()

const editor = inject(blockEditorContextKey, null)
const surface = ref<InstanceType<typeof EditableSurface> | null>(null)

const text = computed({
  get: () => blockPlainText(props.block),
  set: (value: string) => emit('update', setBlockPlainText(props.block, value)),
})

onMounted(() => {
  editor?.registerSurface(props.block.id, {
    focus: (offset?: number) => surface.value?.focus(offset),
    getOffset: () => surface.value?.getOffset() ?? 0,
  })
})

onUnmounted(() => {
  editor?.unregisterSurface(props.block.id)
})
</script>

<template>
  <div class="border-l-4 border-primary/40 pl-3 text-on-surface-variant">
    <EditableSurface
      ref="surface"
      v-model="text"
      placeholder="Citation"
      @enter="emit('enter', $event)"
      @shift-enter="emit('shiftEnter', $event)"
      @tab="emit('tab')"
      @shift-tab="emit('shiftTab')"
      @backspace-empty="emit('backspaceEmpty')"
      @delete-block="emit('deleteBlock')"
      @slash-change="emit('slashChange', $event)"
      @blur="emit('blur')"
      @focus="emit('focus')"
    />
  </div>
</template>
