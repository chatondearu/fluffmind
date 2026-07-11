<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'

import {
  blockPlainText,
  createEmptyBlock,
  isBlockEmpty,
  mergeBlockText,
  setBlockPlainText,
  splitTextAt,
} from '../block-text'
import { blockEditorContextKey } from '../block-editor-context'
import { registerDefaultBlocks } from '../register-defaults'
import { filterSlashCommands, type SlashCommand } from '../slash-commands'
import type { BlockNode } from '../types'
import BlockRenderer from './BlockRenderer.vue'
import SlashMenu from './SlashMenu.vue'

registerDefaultBlocks()

const blocks = defineModel<BlockNode[]>({ required: true })

const surfaces = new Map<number, { focus: (offset?: number) => void }>()
const slashOpen = ref(false)
const slashQuery = ref('')
const slashAnchor = ref<DOMRect | null>(null)
const slashBlockIndex = ref<number | null>(null)
const slashMenu = ref<InstanceType<typeof SlashMenu> | null>(null)
const dragFromIndex = ref<number | null>(null)

const filteredCommands = computed(() => filterSlashCommands(slashQuery.value))

provide(blockEditorContextKey, {
  blockIndex: slashBlockIndex,
  registerSurface(index: number, surface: { focus: (offset?: number) => void }) {
    surfaces.set(index, surface)
  },
  unregisterSurface(index: number) {
    surfaces.delete(index)
  },
})

function ensureAtLeastOneBlock() {
  if (blocks.value.length === 0) {
    blocks.value = [createEmptyBlock('paragraph')]
  }
}

function ensureTrailingEmptyBlock() {
  ensureAtLeastOneBlock()
  const last = blocks.value[blocks.value.length - 1]
  if (!last || last.type !== 'paragraph' || !isBlockEmpty(last)) {
    blocks.value = [...blocks.value, createEmptyBlock('paragraph')]
  }
}

function commitBlocks(next: BlockNode[]) {
  blocks.value = next
  ensureTrailingEmptyBlock()
}

onMounted(() => {
  ensureTrailingEmptyBlock()
  nextTick(() => surfaces.get(0)?.focus(0))
  window.addEventListener('keydown', onGlobalKeydown)
})

watch(
  () => blocks.value.length,
  () => ensureTrailingEmptyBlock(),
)

function updateBlock(index: number, next: BlockNode) {
  const copy = [...blocks.value]
  copy[index] = next
  commitBlocks(copy)
}

function focusBlock(index: number, offset = 0) {
  nextTick(() => surfaces.get(index)?.focus(offset))
}

function insertBlockAfter(index: number, block: BlockNode) {
  const copy = [...blocks.value]
  copy.splice(index + 1, 0, block)
  commitBlocks(copy)
  focusBlock(index + 1, 0)
}

function handleEnter(index: number, offset: number) {
  closeSlash()
  const block = blocks.value[index]
  if (!block) return

  const text = blockPlainText(block)
  const [before, after] = splitTextAt(text, offset)
  updateBlock(index, setBlockPlainText(block, before))
  insertBlockAfter(index, createEmptyBlock('paragraph'))
  if (after.length > 0) {
    updateBlock(index + 1, setBlockPlainText(blocks.value[index + 1]!, after))
    focusBlock(index + 1, 0)
  }
}

function handleShiftEnter(index: number, offset: number) {
  closeSlash()
  const block = blocks.value[index]
  if (!block) return
  const text = blockPlainText(block)
  const [before, after] = splitTextAt(text, offset)
  updateBlock(index, setBlockPlainText(block, `${before}\n${after}`))
  focusBlock(index, offset + 1)
}

function handleBackspaceEmpty(index: number) {
  closeSlash()
  if (index === 0 || blocks.value.length <= 1) return

  const previous = blocks.value[index - 1]
  const current = blocks.value[index]
  if (!previous || !current) return

  const merged = mergeBlockText(blockPlainText(previous), blockPlainText(current))
  updateBlock(index - 1, setBlockPlainText(previous, merged))

  const copy = [...blocks.value]
  copy.splice(index, 1)
  commitBlocks(copy)
  focusBlock(index - 1, merged.length)
}

function handleSlashChange(
  index: number,
  payload: { active: boolean, query: string, rect: DOMRect | null },
) {
  if (payload.active) {
    slashOpen.value = true
    slashQuery.value = payload.query
    slashAnchor.value = payload.rect
    slashBlockIndex.value = index
    return
  }
  if (slashBlockIndex.value === index) {
    closeSlash()
  }
}

function closeSlash() {
  slashOpen.value = false
  slashQuery.value = ''
  slashAnchor.value = null
  slashBlockIndex.value = null
}

function applySlashCommand(command: SlashCommand) {
  const index = slashBlockIndex.value
  if (index === null) return

  const block = createEmptyBlock(command.type, command.level ?? 1)
  updateBlock(index, block)
  closeSlash()
  focusBlock(index, 0)
}

function onBlockDragStart(index: number, event: DragEvent) {
  dragFromIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onBlockDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function moveBlock(from: number, to: number) {
  if (from === to || from < 0 || to < 0) return
  const copy = [...blocks.value]
  const [moved] = copy.splice(from, 1)
  if (!moved) return
  let insertAt = to
  if (from < to) insertAt -= 1
  copy.splice(insertAt, 0, moved)
  commitBlocks(copy)
  focusBlock(insertAt, 0)
}

function onBlockDrop(targetIndex: number, event: DragEvent) {
  event.preventDefault()
  const from = dragFromIndex.value
  dragFromIndex.value = null
  if (from === null) return
  moveBlock(from, targetIndex)
}

function onBlockDragEnd() {
  dragFromIndex.value = null
}

function onGlobalKeydown(event: KeyboardEvent) {
  slashMenu.value?.onKeydown(event)
}

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="notion-editor flex flex-col gap-1 py-2">
    <div
      v-for="(block, index) in blocks"
      :key="block.id"
      class="group flex items-start gap-1 rounded-xl px-1 py-0.5 transition-colors hover:bg-on-surface/5"
      @dragover="onBlockDragOver"
      @drop="onBlockDrop(index, $event)"
    >
      <button
        type="button"
        class="mt-1 cursor-grab rounded-full px-1 font-mono text-xs text-on-surface-variant opacity-0 transition-opacity hover:bg-on-surface/8 group-hover:opacity-100"
        title="Déplacer le bloc"
        draggable="true"
        @dragstart="onBlockDragStart(index, $event)"
        @dragend="onBlockDragEnd"
      >
        ⋮⋮
      </button>
      <div class="min-w-0 flex-1">
        <BlockRenderer
          :block="block"
          :index="index"
          @update="updateBlock(index, $event)"
          @enter="handleEnter(index, $event)"
          @shift-enter="handleShiftEnter(index, $event)"
          @backspace-empty="handleBackspaceEmpty(index)"
          @slash-change="handleSlashChange(index, $event)"
        />
      </div>
    </div>

    <SlashMenu
      ref="slashMenu"
      :open="slashOpen"
      :commands="filteredCommands"
      :anchor-rect="slashAnchor"
      @select="applySlashCommand"
      @close="closeSlash"
    />
  </div>
</template>

<style scoped>
.notion-editor :deep(.editable-surface) {
  min-height: 1.5rem;
  line-height: 1.6;
}
</style>
