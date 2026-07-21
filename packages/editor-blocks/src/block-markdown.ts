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

/** True when plain text contains block-level markdown shorthand worth re-parsing. */
export function hasMarkdownBlockSyntax(text: string): boolean {
  const line = text.trimStart()
  if (/^#{1,6}(?:\s|$)/.test(line)) return true
  if (/^[-*+]\s+/.test(line)) return true
  if (/^\d+\.\s+/.test(line)) return true
  if (/^-\s+\[[ xX]\]\s+/.test(line)) return true
  if (line.startsWith('>')) return true
  if (line.startsWith('```')) return true
  if (/^---+$/.test(line)) return true
  if (/^!\[/.test(line)) return true
  return false
}

/** Promote a block's plain text into typed block(s) after markdown parsing on blur. */
export function promoteBlockFromMarkdown(block: BlockNode): BlockNode[] {
  const text = blockPlainText(block).trim()
  if (!text || text.startsWith('/')) return [block]

  // Preserve toolbar-selected types unless the user typed markdown block syntax.
  if (block.type !== 'paragraph' && !hasMarkdownBlockSyntax(text)) {
    return [block]
  }

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

  const next = [...withoutTrailing, trailing]
  if (
    next.length === blocks.length
    && next.every((block, index) => block === blocks[index])
  ) {
    return blocks
  }

  return next
}

/** @deprecated alias — prefer ensureTrailingSentinel */
export const normalizeEditorBlocks = ensureTrailingSentinel
