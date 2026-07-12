import { blockPlainText, createEmptyBlock, isBlockEmpty } from './block-text'
import { createBlockId } from './ids'
import { mdastToBlocks } from './mdast-to-blocks'
import { markdownProcessor } from './remark'
import type { BlockNode } from './types'

function assignBlockIds(blocks: BlockNode[]): BlockNode[] {
  return blocks.map(block => ({
    ...block,
    id: block.id || createBlockId(),
    children: block.children ? assignBlockIds(block.children) : undefined,
  }))
}

function parseMarkdownFragment(markdown: string): BlockNode[] {
  const ast = markdownProcessor.parse(markdown)
  return assignBlockIds(mdastToBlocks(ast))
}

/** Promote a block's plain text into typed block(s) after markdown parsing on blur. */
export function promoteBlockFromMarkdown(block: BlockNode): BlockNode[] {
  const text = blockPlainText(block).trim()
  if (!text || text.startsWith('/')) return [block]

  const parsed = parseMarkdownFragment(text)
  if (parsed.length === 0) return [block]

  if (parsed.length === 1) {
    const promoted = parsed[0]!
    if (promoted.type === 'paragraph' && isBlockEmpty(promoted)) return [block]
    if (promoted.type === block.type && blockPlainText(promoted) === text) return [block]
    return [{ ...promoted, id: block.id }]
  }

  return parsed.map((promoted, index) =>
    index === 0 ? { ...promoted, id: block.id } : { ...promoted, id: createBlockId() },
  )
}

/** Remove all trailing empty paragraphs. */
export function stripTrailingEmptyBlocks(blocks: BlockNode[]): BlockNode[] {
  const copy = [...blocks]
  while (copy.length > 0) {
    const last = copy[copy.length - 1]
    if (!last || last.type !== 'paragraph' || !isBlockEmpty(last)) break
    copy.pop()
  }
  return copy
}

/** Keep exactly one trailing empty paragraph for editing, reusing its id when possible. */
export function ensureTrailingSentinel(blocks: BlockNode[]): BlockNode[] {
  const withoutTrailing = stripTrailingEmptyBlocks(blocks)
  if (withoutTrailing.length === 0) {
    return [createEmptyBlock('paragraph')]
  }

  const lastInput = blocks[blocks.length - 1]
  const trailing = (lastInput?.type === 'paragraph' && isBlockEmpty(lastInput))
    ? lastInput
    : createEmptyBlock('paragraph')

  return [...withoutTrailing, trailing]
}

/** @deprecated alias — prefer ensureTrailingSentinel */
export const normalizeEditorBlocks = ensureTrailingSentinel
