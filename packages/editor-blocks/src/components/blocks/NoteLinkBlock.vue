<script setup lang="ts">
import { computed, inject } from 'vue'

import { blockEditorContextKey } from '../../block-editor-context'
import type { BlockNode, InlineNode } from '../../types'

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
const listId = `vault-notes-${props.block.id}`

const notes = computed(() => editor?.vaultNotes.value ?? [])

const target = computed({
  get: () => props.block.inlines?.find(inline => inline.type === 'wikilink')?.target ?? '',
  set: (value: string) => {
    const trimmed = value.trim()
    const existing = props.block.inlines?.find(inline => inline.type === 'wikilink')
    const note = notes.value.find(item => item.id === trimmed)
    const label = note?.title ?? existing?.alias ?? trimmed
    const inlines: InlineNode[] = [{
      type: 'wikilink',
      target: trimmed,
      value: label,
      alias: note?.title && note.title !== trimmed ? note.title : existing?.alias,
    }]
    emit('update', { ...props.block, inlines })
  },
})

const label = computed(() => {
  const link = props.block.inlines?.find(inline => inline.type === 'wikilink')
  if (!link?.target) return 'Lien vers une note…'
  const note = notes.value.find(item => item.id === link.target)
  return note?.title ?? link.alias ?? link.target
})

const isBroken = computed(() => Boolean(target.value) && !notes.value.some(note => note.id === target.value))
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2"
    :class="{ 'border-error/40 opacity-80': isBroken }"
  >
    <span class="md3-label-md shrink-0 text-on-surface-variant">Note</span>
    <input
      v-model="target"
      :list="listId"
      class="md3-field min-w-0 flex-1 font-mono md3-body-sm"
      placeholder="note/id"
    >
    <datalist :id="listId">
      <option v-for="note in notes" :key="note.id" :value="note.id">
        {{ note.title }}
      </option>
    </datalist>
    <span class="md3-body-sm text-on-surface-variant">{{ label }}</span>
    <a
      v-if="target"
      :href="`/notes/${target}`"
      class="md3-body-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      Ouvrir
    </a>
  </div>
</template>
