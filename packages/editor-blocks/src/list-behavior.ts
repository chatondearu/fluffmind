import {
  blockEditableText,
  blockPlainText,
  createEmptyBlock,
  setBlockPlainText,
  splitTextAt,
} from './block-text'
import { clampListIndent, isListBlock, listIndent } from './list-utils'
import type { BlockNode } from './types'

export interface EditorMutation {
  blocks: BlockNode[]
  /** Index to focus after the mutation. */
  focusIndex: number
  /** Caret offset within the focused block. */
  focusOffset: number
}

function replaceAt(blocks: BlockNode[], index: number, next: BlockNode): BlockNode[] {
  const copy = [...blocks]
  copy[index] = next
  return copy
}

function insertAfter(blocks: BlockNode[], index: number, next: BlockNode): BlockNode[] {
  const copy = [...blocks]
  copy.splice(index + 1, 0, next)
  return copy
}

/**
 * Notion-like Enter inside a list/task item.
 * Empty item: outdent, or convert to paragraph at indent 0.
 * Non-empty: split and insert a sibling of the same type (tasks reset checked).
 */
export function applyListEnter(
  blocks: BlockNode[],
  index: number,
  offset: number,
): EditorMutation | null {
  const block = blocks[index]
  if (!block || !isListBlock(block)) return null

  const plain = blockPlainText(block)
  const editable = blockEditableText(block)

  if (plain.length === 0 && offset === 0) {
    const indent = listIndent(block)
    if (indent > 0) {
      return {
        blocks: replaceAt(blocks, index, { ...block, indent: indent - 1 }),
        focusIndex: index,
        focusOffset: 0,
      }
    }
    const paragraph = setBlockPlainText(createEmptyBlock('paragraph'), '')
    paragraph.id = block.id
    return {
      blocks: replaceAt(blocks, index, paragraph),
      focusIndex: index,
      focusOffset: 0,
    }
  }

  const [before, after] = splitTextAt(editable, offset)
  let nextBlocks = replaceAt(blocks, index, setBlockPlainText(block, before))
  const sibling = createEmptyBlock(block.type)
  sibling.indent = listIndent(block)
  if (block.type === 'taskList') {
    sibling.checked = false
  }
  nextBlocks = insertAfter(nextBlocks, index, sibling)
  if (after.length > 0) {
    nextBlocks = replaceAt(nextBlocks, index + 1, setBlockPlainText(nextBlocks[index + 1]!, after))
  }
  return {
    blocks: nextBlocks,
    focusIndex: index + 1,
    focusOffset: 0,
  }
}

/** Indent a list item by one level when allowed. */
export function applyListTab(blocks: BlockNode[], index: number): EditorMutation | null {
  const block = blocks[index]
  if (!block || !isListBlock(block)) return null

  const nextIndent = clampListIndent(blocks, index, listIndent(block) + 1)
  if (nextIndent === listIndent(block)) return null

  return {
    blocks: replaceAt(blocks, index, { ...block, indent: nextIndent }),
    focusIndex: index,
    focusOffset: -1,
  }
}

/** Outdent a list item by one level. */
export function applyListShiftTab(blocks: BlockNode[], index: number): EditorMutation | null {
  const block = blocks[index]
  if (!block || !isListBlock(block)) return null

  const indent = listIndent(block)
  if (indent <= 0) return null

  return {
    blocks: replaceAt(blocks, index, { ...block, indent: indent - 1 }),
    focusIndex: index,
    focusOffset: -1,
  }
}

/** Toggle checked state on a task list item. */
export function applyTaskToggle(blocks: BlockNode[], index: number): EditorMutation | null {
  const block = blocks[index]
  if (!block || block.type !== 'taskList') return null

  return {
    blocks: replaceAt(blocks, index, { ...block, checked: !block.checked }),
    focusIndex: index,
    focusOffset: -1,
  }
}
