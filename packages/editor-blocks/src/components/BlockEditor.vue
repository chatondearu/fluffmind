<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, provide, ref } from 'vue'

import { ensureTrailingSentinel, promoteBlockFromMarkdown, stripTrailingEmptyBlocks } from '../block-markdown'
import { reorderBlocksById } from '../reorder-blocks'
import {
  blockPlainText,
  createEmptyBlock,
  setBlockPlainText,
  splitTextAt,
} from '../block-text'
import { blockEditorContextKey } from '../block-editor-context'
import { createBlockId } from '../ids'
import { registerDefaultBlocks } from '../register-defaults'
import { filterSlashCommands, type SlashCommand } from '../slash-commands'
import type { BlockNode } from '../types'
import BlockRenderer from './BlockRenderer.vue'
import BlockToolbar from './BlockToolbar.vue'
import SlashMenu from './SlashMenu.vue'

registerDefaultBlocks()

const props = withDefaults(defineProps<{
  vaultNotes?: Array<{ id: string, title: string }>
}>(), {
  vaultNotes: () => [],
})

const blocks = defineModel<BlockNode[]>({ required: true })

const surfaces = new Map<string, { focus: (offset?: number) => void, getOffset: () => number }>()
const activeBlockId = ref<string | null>(null)
const slashOpen = ref(false)
const slashQuery = ref('')
const slashAnchor = ref<DOMRect | null>(null)
const slashBlockIndex = ref<number | null>(null)
const slashMenu = ref<InstanceType<typeof SlashMenu> | null>(null)
const dragFromBlockId = ref<string | null>(null)
const dragOverBlockId = ref<string | null>(null)
const hoveredIndex = ref<number | null>(null)
const toolbarMenuOpenIndex = ref<number | null>(null)
const suppressBlurPromotion = ref(false)

const filteredCommands = computed(() => filterSlashCommands(slashQuery.value))

const isDragging = computed(() => dragFromBlockId.value !== null)

const draggedBlockId = computed(() => dragFromBlockId.value)

const visibleBlocks = computed(() => {
  const fromId = dragFromBlockId.value
  const overId = dragOverBlockId.value
  if (!fromId || !overId) return blocks.value
  return reorderBlocksById(blocks.value, fromId, overId)
})

provide(blockEditorContextKey, {
  blockIndex: slashBlockIndex,
  vaultNotes: computed(() => props.vaultNotes),
  registerSurface(blockId: string, surface: { focus: (offset?: number) => void, getOffset: () => number }) {
    surfaces.set(blockId, surface)
  },
  unregisterSurface(blockId: string) {
    surfaces.delete(blockId)
  },
})

function setBlocks(next: BlockNode[]) {
  blocks.value = ensureTrailingSentinel(next)
}

function updateBlock(index: number, next: BlockNode) {
  const blockId = next.id
  const previousLength = blocks.value.length
  const shouldRestoreFocus = activeBlockId.value === blockId
  const offset = shouldRestoreFocus ? surfaces.get(blockId)?.getOffset() : undefined

  const copy = [...blocks.value]
  copy[index] = next
  const nextBlocks = ensureTrailingSentinel(copy)
  const sentinelAdded = nextBlocks.length > previousLength
  blocks.value = nextBlocks

  // Only restore focus when a new trailing sentinel was inserted (typing in last empty block).
  if (shouldRestoreFocus && sentinelAdded && offset !== undefined) {
    nextTick(() => {
      if (activeBlockId.value === blockId) {
        surfaces.get(blockId)?.focus(offset)
      }
    })
  }
}

function handleFocus(blockId: string) {
  activeBlockId.value = blockId
}

function focusBlockById(blockId: string, offset = 0) {
  nextTick(() => surfaces.get(blockId)?.focus(offset))
}

function focusBlock(index: number, offset = 0) {
  const blockId = blocks.value[index]?.id
  if (blockId) focusBlockById(blockId, offset)
}

function insertBlockAfter(index: number, block: BlockNode) {
  const copy = [...blocks.value]
  copy.splice(index + 1, 0, block)
  setBlocks(copy)
  focusBlock(index + 1, 0)
}

const promoteBlockAtIndex = useDebounceFn((index: number) => {
  if (suppressBlurPromotion.value) return

  const block = blocks.value[index]
  if (!block) return

  const promoted = promoteBlockFromMarkdown(block)
  if (promoted.length === 1 && promoted[0]?.id === block.id && promoted[0].type === block.type) {
    return
  }

  const copy = [...blocks.value]
  copy.splice(index, 1, ...promoted)
  setBlocks(copy)
}, 200)

onMounted(() => {
  setBlocks(blocks.value)
  nextTick(() => focusBlock(0, 0))
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  suppressBlurPromotion.value = true
  blocks.value = stripTrailingEmptyBlocks(blocks.value)
})

function handleEnter(index: number, offset: number) {
  closeSlash()
  const block = blocks.value[index]
  if (!block) return

  if (block.type === 'bulletList' || block.type === 'orderedList') {
    const text = blockPlainText(block)
    const [before, after] = splitTextAt(text, offset)
    updateBlock(index, setBlockPlainText(block, before))
    insertBlockAfter(index, createEmptyBlock(block.type))
    if (after.length > 0) {
      updateBlock(index + 1, setBlockPlainText(blocks.value[index + 1]!, after))
      focusBlock(index + 1, 0)
    }
    return
  }

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

  const focusOffset = blockPlainText(previous).length
  const copy = [...blocks.value]
  copy.splice(index, 1)
  setBlocks(copy)
  focusBlock(index - 1, focusOffset)
}

function handleDeleteBlock(index: number) {
  if (slashOpen.value) return
  closeSlash()

  if (blocks.value.length <= 1) {
    setBlocks([createEmptyBlock('paragraph')])
    focusBlock(0, 0)
    return
  }

  const focusIndex = index > 0 ? index - 1 : 0
  const focusOffset = index > 0 ? blockPlainText(blocks.value[index - 1]!).length : 0

  const copy = [...blocks.value]
  copy.splice(index, 1)
  setBlocks(copy)
  focusBlock(focusIndex, focusOffset)
}

function handleBlur(index: number) {
  closeSlash()
  const block = blocks.value[index]
  if (block && activeBlockId.value === block.id) {
    activeBlockId.value = null
  }
  if (!isDragging.value) {
    promoteBlockAtIndex(index)
  }
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

function deleteBlock(index: number) {
  if (blocks.value.length <= 1) {
    setBlocks([createEmptyBlock('paragraph')])
    return
  }
  const copy = [...blocks.value]
  copy.splice(index, 1)
  setBlocks(copy)
  focusBlock(Math.max(0, index - 1), 0)
}

function copyBlock(index: number) {
  const source = blocks.value[index]
  if (!source) return
  const clone = structuredClone(source)
  clone.id = createBlockId()
  const copy = [...blocks.value]
  copy.splice(index + 1, 0, clone)
  setBlocks(copy)
  focusBlock(index + 1, 0)
}

function changeBlockType(index: number, command: SlashCommand) {
  const current = blocks.value[index]
  if (!current) return

  suppressBlurPromotion.value = true

  const text = blockPlainText(current)
  const blockId = current.id
  const next = setBlockPlainText(createEmptyBlock(command.type, command.level ?? 1), text)
  next.id = blockId
  updateBlock(index, next)

  nextTick(() => {
    focusBlockById(blockId, text.length)
    suppressBlurPromotion.value = false
  })
}

function onBlockDragStart(blockId: string, event: DragEvent) {
  dragFromBlockId.value = blockId
  dragOverBlockId.value = blockId
  suppressBlurPromotion.value = true
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-fluffmind-block-id', blockId)
    event.dataTransfer.setData('text/plain', blockId)
  }
}

function onBlockDragOver(blockId: string, event: DragEvent) {
  event.preventDefault()
  dragOverBlockId.value = blockId
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onBlockDrop(targetBlockId: string, event: DragEvent) {
  event.preventDefault()
  const fromId = dragFromBlockId.value
  dragFromBlockId.value = null
  dragOverBlockId.value = null
  suppressBlurPromotion.value = false
  if (!fromId || fromId === targetBlockId) return

  const next = reorderBlocksById(blocks.value, fromId, targetBlockId)
  const insertAt = next.findIndex(block => block.id === fromId)
  setBlocks(next)
  if (insertAt !== -1) {
    focusBlock(insertAt, 0)
  }
}

function onBlockDragEnd() {
  dragFromBlockId.value = null
  dragOverBlockId.value = null
  suppressBlurPromotion.value = false
}

function blockIndexForRender(block: BlockNode): number {
  return blocks.value.findIndex(item => item.id === block.id)
}

function isToolbarVisible(block: BlockNode): boolean {
  const index = blockIndexForRender(block)
  return (hoveredIndex.value === index || toolbarMenuOpenIndex.value === index) && !isDragging.value
}

function onToolbarMenuOpenChange(block: BlockNode, open: boolean) {
  const index = blockIndexForRender(block)
  toolbarMenuOpenIndex.value = open ? index : (toolbarMenuOpenIndex.value === index ? null : toolbarMenuOpenIndex.value)
}

function onGlobalKeydown(event: KeyboardEvent) {
  slashMenu.value?.onKeydown(event)
}
</script>

<template>
  <div class="notion-editor flex flex-col gap-1 py-2">
    <div
      v-for="block in visibleBlocks"
      :key="block.id"
      class="group relative flex items-start gap-1 rounded-xl px-1 py-0.5 transition-all"
      :class="{
        'opacity-40': isDragging && draggedBlockId === block.id,
        'ring-2 ring-primary/30 bg-primary/5': isDragging && dragOverBlockId === block.id,
        'hover:bg-on-surface/5': !isDragging,
      }"
      @mouseenter="hoveredIndex = blockIndexForRender(block)"
      @mouseleave="hoveredIndex = null"
      @dragover="onBlockDragOver(block.id, $event)"
      @drop="onBlockDrop(block.id, $event)"
    >
      <button
        type="button"
        class="mt-1 cursor-grab rounded-full px-1 font-mono text-xs text-on-surface-variant opacity-0 transition-opacity hover:bg-on-surface/8 group-hover:opacity-100"
        title="Déplacer le bloc"
        draggable="true"
        @dragstart="onBlockDragStart(block.id, $event)"
        @dragend="onBlockDragEnd"
      >
        ⋮⋮
      </button>

      <div class="relative min-w-0 flex-1">
        <BlockToolbar
          :visible="isToolbarVisible(block)"
          @delete="deleteBlock(blockIndexForRender(block))"
          @copy="copyBlock(blockIndexForRender(block))"
          @change-type="changeBlockType(blockIndexForRender(block), $event)"
          @menu-open-change="onToolbarMenuOpenChange(block, $event)"
        />
        <BlockRenderer
          :block="block"
          :index="blockIndexForRender(block)"
          @update="updateBlock(blockIndexForRender(block), $event)"
          @enter="handleEnter(blockIndexForRender(block), $event)"
          @shift-enter="handleShiftEnter(blockIndexForRender(block), $event)"
          @backspace-empty="handleBackspaceEmpty(blockIndexForRender(block))"
          @delete-block="handleDeleteBlock(blockIndexForRender(block))"
          @slash-change="handleSlashChange(blockIndexForRender(block), $event)"
          @blur="handleBlur(blockIndexForRender(block))"
          @focus="handleFocus(block.id)"
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
