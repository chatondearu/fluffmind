<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

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
  tab: []
  shiftTab: []
  backspaceEmpty: []
  deleteBlock: []
  slashChange: [payload: { active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
}>()

const editor = inject(blockEditorContextKey, null)
const surface = ref<InstanceType<typeof EditableSurface> | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const mode = ref<'source' | 'preview'>('preview')
const renderError = ref<string | null>(null)
const rendering = ref(false)

const text = computed({
  get: () => blockPlainText(props.block),
  set: (value: string) => emit('update', setBlockPlainText(props.block, value)),
})

onMounted(() => {
  editor?.registerSurface(props.block.id, {
    focus: (offset?: number) => {
      mode.value = 'source'
      nextTick(() => surface.value?.focus(offset))
    },
    getOffset: () => surface.value?.getOffset() ?? 0,
  })
  void renderPreview()
})

onUnmounted(() => {
  editor?.unregisterSurface(props.block.id)
})

watch(() => props.block.text, () => {
  if (mode.value === 'preview') {
    void renderPreview()
  }
})

watch(mode, (next) => {
  if (next === 'preview') {
    void renderPreview()
  }
})

async function renderPreview() {
  if (!previewEl.value) return
  rendering.value = true
  renderError.value = null
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
    })
    const id = `mermaid-${props.block.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
    const source = text.value.trim() || 'flowchart TD\n  A --> B'
    const { svg } = await mermaid.render(id, source)
    previewEl.value.innerHTML = svg
  }
  catch (error) {
    renderError.value = error instanceof Error ? error.message : 'Erreur Mermaid'
    if (previewEl.value) {
      previewEl.value.innerHTML = ''
    }
  }
  finally {
    rendering.value = false
  }
}
</script>

<template>
  <div class="rounded-lg border border-outline-variant/40 p-2">
    <div class="mb-2 flex gap-1">
      <button
        type="button"
        class="rounded px-2 py-1 md3-label-md"
        :class="mode === 'source' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant'"
        @click="mode = 'source'"
      >
        Source
      </button>
      <button
        type="button"
        class="rounded px-2 py-1 md3-label-md"
        :class="mode === 'preview' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant'"
        @click="mode = 'preview'"
      >
        Aperçu
      </button>
    </div>

    <EditableSurface
      v-show="mode === 'source'"
      ref="surface"
      v-model="text"
      placeholder="flowchart TD&#10;  A --> B"
      text-class="font-mono md3-body-sm"
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

    <div
      v-show="mode === 'preview'"
      class="min-h-16 overflow-x-auto"
    >
      <p
        v-if="rendering"
        class="md3-body-sm text-on-surface-variant"
      >
        Rendu…
      </p>
      <p
        v-else-if="renderError"
        class="md3-body-sm text-error"
      >
        {{ renderError }}
      </p>
      <div
        ref="previewEl"
        class="flex justify-center [&_svg]:max-w-full"
      />
    </div>
  </div>
</template>
