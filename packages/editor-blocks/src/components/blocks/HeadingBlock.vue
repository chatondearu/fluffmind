<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import type { BlockNode, InlineNode } from '../../types'
import InlineEditable from '../InlineEditable.vue'

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
const surface = ref<InstanceType<typeof InlineEditable> | null>(null)

const level = computed(() => Math.min(6, Math.max(1, props.block.level ?? 1)))

const headingClass = computed(() => {
  switch (level.value) {
    case 1: return 'md3-display-sm'
    case 2: return 'md3-headline-sm'
    case 3: return 'md3-title-md text-lg'
    default: return 'md3-title-sm'
  }
})

const inlines = computed({
  get: () => props.block.inlines ?? [{ type: 'text', value: '' }],
  set: (value: InlineNode[]) => emit('update', { ...props.block, inlines: value }),
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
  <InlineEditable
    ref="surface"
    v-model:inlines="inlines"
    placeholder="Titre"
    :multiline="false"
    :text-class="headingClass"
    @enter="emit('enter', $event)"
    @shift-enter="emit('shiftEnter', $event)"
    @backspace-empty="emit('backspaceEmpty')"
    @delete-block="emit('deleteBlock')"
    @slash-change="emit('slashChange', $event)"
    @blur="emit('blur')"
    @focus="emit('focus')"
  />
</template>
