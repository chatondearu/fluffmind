<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import { inlinesToMarkdown } from '../../inlines'
import type { BlockNode } from '../../types'
import EditableSurface from '../EditableSurface.vue'

const CALLOUT_KINDS = ['note', 'tip', 'info', 'warning', 'important', 'caution', 'success', 'question'] as const

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
const bodySurface = ref<InstanceType<typeof EditableSurface> | null>(null)

const kind = computed({
  get: () => props.block.calloutKind ?? 'note',
  set: (value: string) => emit('update', { ...props.block, calloutKind: value }),
})

const title = computed({
  get: () => props.block.text ?? '',
  set: (value: string) => emit('update', { ...props.block, text: value }),
})

const body = computed({
  get: () => inlinesToMarkdown(props.block.inlines ?? []),
  set: (value: string) => emit('update', {
    ...props.block,
    inlines: [{ type: 'text', value }],
  }),
})

onMounted(() => {
  editor?.registerSurface(props.block.id, {
    focus: (offset?: number) => bodySurface.value?.focus(offset),
    getOffset: () => bodySurface.value?.getOffset() ?? 0,
  })
})

onUnmounted(() => {
  editor?.unregisterSurface(props.block.id)
})
</script>

<template>
  <div class="rounded-lg border border-outline-variant/50 bg-surface-container-low/60 p-3">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <select
        v-model="kind"
        class="rounded border border-outline-variant/50 bg-transparent px-2 py-1 md3-body-sm outline-none"
        aria-label="Type de callout"
      >
        <option
          v-for="option in CALLOUT_KINDS"
          :key="option"
          :value="option"
        >
          {{ option }}
        </option>
      </select>
      <input
        v-model="title"
        type="text"
        class="min-w-0 flex-1 rounded border border-outline-variant/40 bg-transparent px-2 py-1 md3-title-sm outline-none focus:border-primary"
        placeholder="Titre"
        @focus="emit('focus')"
        @blur="emit('blur')"
      >
    </div>
    <EditableSurface
      ref="bodySurface"
      v-model="body"
      placeholder="Contenu du callout"
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
