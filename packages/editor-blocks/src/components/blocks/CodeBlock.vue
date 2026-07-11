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
  backspaceEmpty: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
}>()

const editor = inject(blockEditorContextKey, null)
const surface = ref<InstanceType<typeof EditableSurface> | null>(null)

const text = computed({
  get: () => blockPlainText(props.block),
  set: (value: string) => emit('update', setBlockPlainText(props.block, value)),
})

onMounted(() => {
  editor?.registerSurface(props.index, {
    focus: (offset?: number) => surface.value?.focus(offset),
  })
})

onUnmounted(() => {
  editor?.unregisterSurface(props.index)
})
</script>

<template>
  <div class="md3-card px-3 py-2 font-mono md3-body-md shadow-none">
    <EditableSurface
      ref="surface"
      v-model="text"
      placeholder="Code"
      @enter="emit('enter', $event)"
      @shift-enter="emit('shiftEnter', $event)"
      @backspace-empty="emit('backspaceEmpty')"
      @slash-change="emit('slashChange', $event)"
      @blur="emit('blur')"
    />
  </div>
</template>
