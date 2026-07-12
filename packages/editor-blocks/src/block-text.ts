import { inlinesToMarkdown, parseInlineMarkdown } from './inlines'
import { createBlockId } from './ids'
import { notePageLinkToMarkdown, parseNoteLinkLine } from './note-page-links'
import type { BlockNode, BlockType } from './types'
import type { InlineNode } from './types'
import { WIKILINK_RE } from './wikilinks'

function hasInlineMarkdownSyntax(text: string): boolean {
  if (WIKILINK_RE.test(text)) return true
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true
  if (/\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_|`[^`]+`/.test(text)) return true
  return false
}

export function blockPlainText(block: BlockNode): string {
  if (block.type === 'code') {
    return block.text ?? ''
  }
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    const item = block.children?.[0]
    const paragraph = item?.children?.[0]
    return paragraph ? blockPlainText(paragraph) : ''
  }
  if (block.type === 'noteLink') {
    const link = block.inlines?.find(inline => inline.type === 'wikilink')
    return link ? notePageLinkToMarkdown(link) : ''
  }
  if (block.inlines?.length) {
    return inlinesToMarkdown(block.inlines)
  }
  return ''
}

export function setBlockPlainText(block: BlockNode, text: string): BlockNode {
  if (block.type === 'code') {
    return { ...block, text }
  }
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    const item = block.children?.[0]
    const paragraph = item?.children?.[0]
    if (!item || !paragraph) return block
    return {
      ...block,
      children: [{
        ...item,
        children: [setBlockPlainText(paragraph, text)],
      }],
    }
  }
  if (block.type === 'noteLink') {
    const parsed = parseNoteLinkLine(text)
    if (parsed) {
      return { ...block, inlines: parsed }
    }
    const trimmed = text.trim()
    const existing = block.inlines?.find(inline => inline.type === 'wikilink')
    return {
      ...block,
      inlines: [{
        type: 'wikilink',
        target: trimmed,
        value: existing?.alias ?? trimmed,
        alias: existing?.alias,
      }],
    }
  }
  return {
    ...block,
    inlines: hasInlineMarkdownSyntax(text) ? parseInlineMarkdown(text) : [{ type: 'text', value: text }],
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
    case 'table': {
      const emptyCell = (): InlineNode[] => [{ type: 'text', value: '' }]
      return {
        id,
        type: 'table',
        rows: [
          { cells: [emptyCell(), emptyCell()] },
          { cells: [emptyCell(), emptyCell()] },
        ],
      }
    }
    case 'noteLink':
      return {
        id,
        type: 'noteLink',
        inlines: [{ type: 'wikilink', target: '', value: '' }],
      }
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
