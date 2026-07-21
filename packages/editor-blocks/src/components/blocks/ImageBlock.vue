<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import type { BlockNode } from '../../types'

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
const root = ref<HTMLElement | null>(null)

const url = computed({
  get: () => props.block.url ?? '',
  set: (value: string) => emit('update', { ...props.block, url: value }),
})

const alt = computed({
  get: () => props.block.alt ?? '',
  set: (value: string) => emit('update', { ...props.block, alt: value }),
})

const hasUrl = computed(() => Boolean(url.value.trim()))

onMounted(() => {
  editor?.registerSurface(props.block.id, {
    focus: () => root.value?.querySelector<HTMLInputElement>('input')?.focus(),
    getOffset: () => 0,
  })
})

onUnmounted(() => {
  editor?.unregisterSurface(props.block.id)
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    emit('enter', 0)
  }
}
</script>

<template>
  <div
    ref="root"
    class="flex flex-col gap-2 rounded-lg border border-outline-variant/40 p-3"
    @focusin="emit('focus')"
    @focusout="emit('blur')"
    @keydown="onKeydown"
  >
    <img
      v-if="hasUrl"
      :src="url"
      :alt="alt"
      class="max-h-64 max-w-full rounded object-contain"
    >
    <p
      v-else
      class="md3-body-sm text-on-surface-variant"
    >
      Aucune image — renseignez une URL
    </p>
    <label class="flex flex-col gap-1 md3-body-sm">
      <span class="text-on-surface-variant">URL</span>
      <input
        v-model="url"
        type="url"
        class="rounded border border-outline-variant/50 bg-transparent px-2 py-1 outline-none focus:border-primary"
        placeholder="https://…"
      >
    </label>
    <label class="flex flex-col gap-1 md3-body-sm">
      <span class="text-on-surface-variant">Texte alternatif</span>
      <input
        v-model="alt"
        type="text"
        class="rounded border border-outline-variant/50 bg-transparent px-2 py-1 outline-none focus:border-primary"
        placeholder="Description"
      >
    </label>
  </div>
</template>
