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

const marker = computed(() => (props.block.type === 'orderedList' ? '1.' : '•'))

const text = computed({
  get: () => {
    const item = props.block.children?.[0]
    const paragraph = item?.children?.[0]
    return paragraph ? blockPlainText(paragraph) : ''
  },
  set: (value: string) => {
    const item = props.block.children?.[0]
    const paragraph = item?.children?.[0]
    if (!item || !paragraph) return
    const nextItem = {
      ...item,
      children: [setBlockPlainText(paragraph, value)],
    }
    emit('update', { ...props.block, children: [nextItem] })
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
  <div class="flex items-start gap-2">
    <span class="mt-0.5 shrink-0 text-on-surface-variant">{{ marker }}</span>
    <EditableSurface
      ref="surface"
      v-model="text"
      placeholder="Liste"
      @enter="emit('enter', $event)"
      @shift-enter="emit('shiftEnter', $event)"
      @backspace-empty="emit('backspaceEmpty')"
      @slash-change="emit('slashChange', $event)"
    />
  </div>
</template>
