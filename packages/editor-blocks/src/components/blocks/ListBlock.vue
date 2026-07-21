<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import { listIndent, orderedListNumber } from '../../list-utils'
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
  tab: []
  shiftTab: []
  backspaceEmpty: []
  deleteBlock: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
}>()

const editor = inject(blockEditorContextKey, null)
const surface = ref<InstanceType<typeof InlineEditable> | null>(null)

const indent = computed(() => listIndent(props.block))

const marker = computed(() => {
  if (props.block.type === 'orderedList') {
    const blocks = editor?.blocks.value ?? [props.block]
    const index = editor
      ? blocks.findIndex(item => item.id === props.block.id)
      : 0
    const number = orderedListNumber(blocks, index === -1 ? 0 : index)
    return `${number}.`
  }
  return '•'
})

const indentStyle = computed(() => ({
  paddingLeft: `${indent.value * 1.5}rem`,
}))

const inlines = computed({
  get: () => {
    const paragraph = props.block.children?.[0]?.children?.[0]
    return paragraph?.inlines ?? [{ type: 'text', value: '' }]
  },
  set: (value: InlineNode[]) => {
    const item = props.block.children?.[0]
    const paragraph = item?.children?.[0]
    if (!item || !paragraph) return
    emit('update', {
      ...props.block,
      children: [{
        ...item,
        children: [{ ...paragraph, inlines: value }],
      }],
    })
  },
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
  <div
    class="flex items-start gap-2"
    :style="indentStyle"
  >
    <span class="mt-0.5 shrink-0 select-none text-on-surface-variant">{{ marker }}</span>
    <InlineEditable
      ref="surface"
      v-model:inlines="inlines"
      placeholder="Liste"
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
