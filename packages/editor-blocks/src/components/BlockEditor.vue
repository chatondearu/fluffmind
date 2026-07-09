<script setup lang="ts">
import { ref } from 'vue'

import { createBlockId } from '../ids'
import { registerDefaultBlocks } from '../register-defaults'
import type { BlockNode } from '../types'
import BlockRenderer from './BlockRenderer.vue'

registerDefaultBlocks()

const blocks = defineModel<BlockNode[]>({ required: true })

const dragIndex = ref<number | null>(null)

function updateBlock(index: number, next: BlockNode) {
  const copy = [...blocks.value]
  copy[index] = next
  blocks.value = copy
}

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(targetIndex: number, event: DragEvent) {
  event.preventDefault()
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === targetIndex) {
    return
  }
  const copy = [...blocks.value]
  const [moved] = copy.splice(from, 1)
  copy.splice(targetIndex, 0, moved!)
  blocks.value = copy
}

function addParagraph() {
  blocks.value = [
    ...blocks.value,
    {
      id: createBlockId(),
      type: 'paragraph',
      inlines: [{ type: 'text', value: '' }],
    },
  ]
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(block, index) in blocks"
      :key="block.id"
      class="group flex gap-2 rounded-md border border-transparent p-1 hover:border-outline-variant"
      draggable="true"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver"
      @drop="onDrop(index, $event)"
    >
      <span
        class="cursor-grab select-none pt-2 font-mono text-xs text-on-surface-variant opacity-40 group-hover:opacity-100"
        title="Drag to reorder"
      >⋮⋮</span>
      <div class="min-w-0 flex-1">
        <BlockRenderer :block="block" @update="updateBlock(index, $event)" />
      </div>
    </div>
    <button
      type="button"
      class="self-start rounded-full border border-outline px-4 py-1 text-sm text-primary hover:bg-primary/10"
      @click="addParagraph"
    >
      + Paragraph
    </button>
  </div>
</template>
