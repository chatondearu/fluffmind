import { createBlockId } from './ids'
import type { BlockNode, BlockType } from './types'

export function blockPlainText(block: BlockNode): string {
  if (block.type === 'code') {
    return block.text ?? ''
  }
  if (block.inlines?.length) {
    return block.inlines.map((i: { value: string }) => i.value).join('')
  }
  return ''
}

export function setBlockPlainText(block: BlockNode, text: string): BlockNode {
  if (block.type === 'code') {
    return { ...block, text }
  }
  return {
    ...block,
    inlines: [{ type: 'text', value: text }],
  }
}

export function createEmptyBlock(type: BlockType, level = 1): BlockNode {
  const id = createBlockId()
  switch (type) {
    case 'paragraph':
      return { id, type: 'paragraph', inlines: [{ type: 'text', value: '' }] }
    case 'heading':
      return { id, type: 'heading', level, inlines: [{ type: 'text', value: '' }] }
    case 'bulletList':
      return {
        id,
        type: 'bulletList',
        children: [{
          id: createBlockId(),
          type: 'listItem',
          children: [{ id: createBlockId(), type: 'paragraph', inlines: [{ type: 'text', value: '' }] }],
        }],
      }
    case 'orderedList':
      return {
        id,
        type: 'orderedList',
        children: [{
          id: createBlockId(),
          type: 'listItem',
          children: [{ id: createBlockId(), type: 'paragraph', inlines: [{ type: 'text', value: '' }] }],
        }],
      }
    case 'code':
      return { id, type: 'code', lang: null, text: '' }
    default:
      return { id, type: 'paragraph', inlines: [{ type: 'text', value: '' }] }
  }
}

export function splitTextAt(text: string, offset: number): [string, string] {
  const safeOffset = Math.max(0, Math.min(offset, text.length))
  return [text.slice(0, safeOffset), text.slice(safeOffset)]
}

export function isBlockEmpty(block: BlockNode): boolean {
  return blockPlainText(block).length === 0
}

export function mergeBlockText(a: string, b: string): string {
  return `${a}${b}`
}
