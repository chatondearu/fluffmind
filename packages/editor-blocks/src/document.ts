import { blocksToMarkdown } from './blocks-to-markdown'
import { createBlockId } from './ids'
import { isBlockEmpty } from './block-text'
import { mdastToBlocks } from './mdast-to-blocks'
import { markdownProcessor } from './remark'
import type { BlockDocument, BlockNode, RoundTripResult } from './types'

export function assignBlockIds(blocks: BlockNode[]): BlockNode[] {
  return blocks.map(block => ({
    ...block,
    id: block.id || createBlockId(),
    children: block.children ? assignBlockIds(block.children) : undefined,
  }))
}

export function parseMarkdownToDocument(markdown: string): BlockDocument {
  const ast = markdownProcessor.parse(markdown)
  const blocks = assignBlockIds(mdastToBlocks(ast))
  return { blocks }
}

export function serializeDocument(document: BlockDocument): string {
  return blocksToMarkdown(stripTrailingEmptyBlocks(document.blocks))
}

/** Remove trailing empty paragraphs before persisting (Notion-style sentinel block). */
export function stripTrailingEmptyBlocks(blocks: BlockNode[]): BlockNode[] {
  const copy = [...blocks]
  while (copy.length > 0) {
    const last = copy[copy.length - 1]
    if (!last || last.type !== 'paragraph' || !isBlockEmpty(last)) break
    copy.pop()
  }
  return copy
}

export function roundTripMarkdown(input: string): RoundTripResult {
  const { blocks } = parseMarkdownToDocument(input)
  const output = blocksToMarkdown(blocks)
  return { input, output, blocks }
}

export function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
}
