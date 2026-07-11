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
}>()

const editor = inject(blockEditorContextKey, null)
const surface = ref<InstanceType<typeof EditableSurface> | null>(null)

const level = computed(() => Math.min(6, Math.max(1, props.block.level ?? 1)))

const headingClass = computed(() => {
  switch (level.value) {
    case 1: return 'text-3xl font-bold'
    case 2: return 'text-2xl font-semibold'
    case 3: return 'text-xl font-semibold'
    default: return 'text-lg font-medium'
  }
})

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
  <div :class="headingClass">
    <EditableSurface
      ref="surface"
      v-model="text"
      placeholder="Titre"
      :multiline="false"
      @enter="emit('enter', $event)"
      @shift-enter="emit('shiftEnter', $event)"
      @backspace-empty="emit('backspaceEmpty')"
      @slash-change="emit('slashChange', $event)"
    />
  </div>
</template>
