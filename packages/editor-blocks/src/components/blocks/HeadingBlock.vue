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

const level = computed(() => Math.min(6, Math.max(1, props.block.level ?? 1)))

const headingClass = computed(() => {
  switch (level.value) {
    case 1: return 'md3-display-sm'
    case 2: return 'md3-headline-sm'
    case 3: return 'md3-title-md text-lg'
    default: return 'md3-title-sm'
  }
})

const text = computed({
  get: () => blockPlainText(props.block),
  set: (value: string) => emit('update', setBlockPlainText(props.block, value)),
})

onMounted(() => {
  editor?.registerSurface(props.block.id, {
    focus: (offset?: number) => surface.value?.focus(offset),
  })
})

onUnmounted(() => {
  editor?.unregisterSurface(props.block.id)
})
</script>

<template>
  <EditableSurface
    ref="surface"
    v-model="text"
    placeholder="Titre"
    :multiline="false"
    :text-class="headingClass"
    @enter="emit('enter', $event)"
    @shift-enter="emit('shiftEnter', $event)"
    @backspace-empty="emit('backspaceEmpty')"
    @slash-change="emit('slashChange', $event)"
    @blur="emit('blur')"
  />
</template>
