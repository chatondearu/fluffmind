import { createBlockId } from './ids'
import { inlinesToMarkdown, inlinesToPlainText, parseInlineMarkdown } from './inlines'
import type { BlockNode, BlockType, InlineNode } from './types'

export function blockPlainText(block: BlockNode): string {
  if (block.type === 'code' || block.type === 'mermaid') {
    return block.text ?? ''
  }
  if (block.type === 'divider') {
    return ''
  }
  if (block.type === 'image') {
    return block.alt ?? ''
  }
  if (block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList') {
    const item = block.children?.[0]
    const paragraph = item?.children?.[0]
    return paragraph ? blockPlainText(paragraph) : ''
  }
  if (block.type === 'noteLink') {
    const link = block.inlines?.find(inline => inline.type === 'wikilink')
    return link?.alias ?? link?.target ?? link?.value ?? ''
  }
  if (block.type === 'callout') {
    const title = block.text ?? ''
    const body = inlinesToPlainText(block.inlines ?? [])
    return title ? `${title}\n${body}` : body
  }
  if (block.inlines?.length) {
    return inlinesToPlainText(block.inlines)
  }
  return ''
}

/**
 * Text used in the editable surface (markdown with marks/links),
 * so caret offsets from contenteditable match split/insert behavior.
 */
export function blockEditableText(block: BlockNode): string {
  if (block.type === 'code' || block.type === 'mermaid') {
    return block.text ?? ''
  }
  if (block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList') {
    const item = block.children?.[0]
    const paragraph = item?.children?.[0]
    return paragraph ? blockEditableText(paragraph) : ''
  }
  if (block.type === 'callout') {
    return inlinesToMarkdown(block.inlines ?? [])
  }
  if (block.type === 'noteLink') {
    return blockPlainText(block)
  }
  if (block.inlines?.length) {
    return inlinesToMarkdown(block.inlines)
  }
  return blockPlainText(block)
}

export function setBlockPlainText(block: BlockNode, text: string): BlockNode {
  if (block.type === 'code' || block.type === 'mermaid') {
    return { ...block, text }
  }
  if (block.type === 'image') {
    return { ...block, alt: text }
  }
  if (block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList') {
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
  if (block.type === 'callout') {
    const newline = text.indexOf('\n')
    if (newline === -1) {
      return {
        ...block,
        text,
        inlines: [{ type: 'text', value: '' }],
      }
    }
    return {
      ...block,
      text: text.slice(0, newline),
      inlines: parseInlineMarkdownPreservingBlocks(text.slice(newline + 1)),
    }
  }
  return {
    ...block,
    inlines: parseInlineMarkdownPreservingBlocks(text),
  }
}

/** Avoid eating ATX/list markers so blur promotion still sees block syntax. */
function parseInlineMarkdownPreservingBlocks(text: string): InlineNode[] {
  const line = text.trimStart()
  if (
    /^#{1,6}(?:\s|$)/.test(line)
    || /^[-*+]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^-\s+\[[ xX]\]\s+/.test(line)
    || line.startsWith('>')
    || line.startsWith('```')
    || /^---+$/.test(line)
  ) {
    return [{ type: 'text', value: text }]
  }
  return parseInlineMarkdown(text)
}

function emptyListItem(): BlockNode {
  return {
    id: createBlockId(),
    type: 'listItem',
    children: [{ id: createBlockId(), type: 'paragraph', inlines: [{ type: 'text', value: '' }] }],
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
        indent: 0,
        children: [emptyListItem()],
      }
    case 'orderedList':
      return {
        id,
        type: 'orderedList',
        indent: 0,
        children: [emptyListItem()],
      }
    case 'taskList':
      return {
        id,
        type: 'taskList',
        indent: 0,
        checked: false,
        children: [emptyListItem()],
      }
    case 'code':
      return { id, type: 'code', lang: null, text: '' }
    case 'mermaid':
      return { id, type: 'mermaid', text: 'flowchart TD\n  A --> B' }
    case 'blockquote':
      return { id, type: 'blockquote', inlines: [{ type: 'text', value: '' }] }
    case 'divider':
      return { id, type: 'divider' }
    case 'image':
      return { id, type: 'image', url: '', alt: '', title: '' }
    case 'callout':
      return {
        id,
        type: 'callout',
        calloutKind: 'note',
        text: '',
        inlines: [{ type: 'text', value: '' }],
      }
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
    case 'listItem':
    case 'fallback':
    default:
      return { id, type: 'paragraph', inlines: [{ type: 'text', value: '' }] }
  }
}

export function splitTextAt(text: string, offset: number): [string, string] {
  const safeOffset = Math.max(0, Math.min(offset, text.length))
  return [text.slice(0, safeOffset), text.slice(safeOffset)]
}

export function isBlockEmpty(block: BlockNode): boolean {
  if (block.type === 'divider') return false
  if (block.type === 'image') return !(block.url?.trim())
  return blockPlainText(block).length === 0
}

export function mergeBlockText(a: string, b: string): string {
  return `${a}${b}`
}
