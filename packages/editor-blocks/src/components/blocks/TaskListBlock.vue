<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import { listIndent } from '../../list-utils'
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

const indentStyle = computed(() => ({
  paddingLeft: `${listIndent(props.block) * 1.5}rem`,
}))

const checked = computed({
  get: () => Boolean(props.block.checked),
  set: (value: boolean) => emit('update', { ...props.block, checked: value }),
})

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
    <input
      v-model="checked"
      type="checkbox"
      class="mt-1.5 size-4 shrink-0 accent-primary"
      aria-label="Tâche"
    >
    <InlineRichSurface
      ref="surface"
      v-model:inlines="inlines"
      placeholder="Tâche"
      :text-class="checked ? 'md3-body-md line-through opacity-60' : 'md3-body-md'"
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
