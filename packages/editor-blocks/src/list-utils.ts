import type { BlockNode } from './types'

export const MAX_LIST_INDENT = 6

export function isListBlock(block: BlockNode): boolean {
  return block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList'
}

export function listIndent(block: BlockNode): number {
  return Math.max(0, block.indent ?? 0)
}

/** Ordered marker number among same-indent ordered siblings (Notion-style). */
export function orderedListNumber(blocks: BlockNode[], index: number): number {
  const current = blocks[index]
  if (!current || current.type !== 'orderedList') return 1

  const indent = listIndent(current)
  let number = 1
  for (let i = index - 1; i >= 0; i--) {
    const prev = blocks[i]
    if (!prev || !isListBlock(prev)) break
    const prevIndent = listIndent(prev)
    if (prevIndent < indent) break
    if (prevIndent === indent) {
      if (prev.type !== 'orderedList') break
      number++
    }
  }
  return number
}

/** Clamp indent so it never jumps more than one level deeper than the previous list item. */
export function clampListIndent(blocks: BlockNode[], index: number, desired: number): number {
  const capped = Math.max(0, Math.min(MAX_LIST_INDENT, desired))
  if (index <= 0) return 0
  const prev = blocks[index - 1]
  if (!prev || !isListBlock(prev)) return 0
  return Math.min(capped, listIndent(prev) + 1)
}
