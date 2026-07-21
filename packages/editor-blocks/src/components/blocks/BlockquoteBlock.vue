<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import type { BlockNode, InlineNode } from '../../types'
import InlineRichSurface from '../InlineRichSurface.vue'

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
const surface = ref<InstanceType<typeof InlineRichSurface> | null>(null)

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
  <div class="rounded-r-lg border-l-4 border-primary bg-primary/5 py-2 pl-4 pr-2 italic text-on-surface-variant">
    <InlineRichSurface
      ref="surface"
      v-model:inlines="inlines"
      placeholder="Citation"
      text-class="md3-body-md italic text-on-surface-variant"
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
