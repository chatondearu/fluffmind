import type {
  Blockquote,
  Content,
  Image,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  TableCell,
} from 'mdast'

import { createBlockId } from './ids'
import type { BlockNode, InlineNode, TableRow } from './types'
import { expandTextWithWikilinks } from './wikilinks'

const CALLOUT_RE = /^\[!([a-zA-Z0-9_-]+)\](?:\s+(.*))?$/

function block(partial: Omit<BlockNode, 'id'> & { id?: string }): BlockNode {
  return { id: partial.id ?? createBlockId(), ...partial }
}

/** Convert a remark mdast root into block nodes (#57). */
export function mdastToBlocks(ast: Root): BlockNode[] {
  return ast.children.flatMap(node => blockFromTopLevel(node))
}

function blockFromTopLevel(node: Content): BlockNode[] {
  switch (node.type) {
    case 'paragraph':
      return paragraphToBlocks(node)
    case 'heading':
      return [block({
        type: 'heading',
        level: node.depth,
        inlines: phrasingToInlines(node.children),
      })]
    case 'list':
      return flattenList(node, 0)
    case 'code':
      if ((node.lang ?? '').toLowerCase() === 'mermaid') {
        return [block({
          type: 'mermaid',
          text: node.value.replace(/\n$/, ''),
        })]
      }
      return [block({
        type: 'code',
        lang: node.lang ?? null,
        text: node.value.replace(/\n$/, ''),
      })]
    case 'table':
      return [block({
        type: 'table',
        rows: tableToRows(node),
      })]
    case 'blockquote':
      return blockquoteToBlocks(node)
    case 'thematicBreak':
      return [block({ type: 'divider' })]
    case 'image':
      return [imageToBlock(node)]
    default:
      return [block({ type: 'fallback', raw: `[unsupported:${node.type}]` })]
  }
}

function paragraphToBlocks(node: Paragraph): BlockNode[] {
  const children = node.children
  if (children.length === 1 && children[0]!.type === 'image') {
    return [imageToBlock(children[0])]
  }
  return [block({ type: 'paragraph', inlines: phrasingToInlines(children) })]
}

function imageToBlock(node: Image): BlockNode {
  return block({
    type: 'image',
    url: node.url,
    alt: node.alt ?? '',
    title: node.title ?? '',
  })
}

function inlinePlainText(inlines: InlineNode[]): string {
  return inlines.map(inline => {
    if (inline.children?.length) {
      return inlinePlainText(inline.children)
    }
    return inline.value
  }).join('')
}

function blockquoteToBlocks(node: Blockquote): BlockNode[] {
  const paragraphs = node.children.filter((child): child is Paragraph => child.type === 'paragraph')
  if (paragraphs.length === 0) {
    return [block({ type: 'blockquote', inlines: [{ type: 'text', value: '' }] })]
  }

  const firstInlines = phrasingToInlines(paragraphs[0]!.children)
  const firstText = inlinePlainText(firstInlines)
  const firstLine = firstText.split('\n')[0]?.trim() ?? ''
  const calloutMatch = firstLine.match(CALLOUT_RE)
  if (calloutMatch) {
    const kind = calloutMatch[1]!.toLowerCase()
    const title = (calloutMatch[2] ?? '').trim()
    const bodyInlines: InlineNode[] = []

    // Remainder of the first paragraph after the callout marker line.
    const restOfFirst = firstText.includes('\n')
      ? firstText.slice(firstText.indexOf('\n') + 1)
      : ''
    if (restOfFirst.length > 0) {
      bodyInlines.push({ type: 'text', value: restOfFirst })
    }

    for (let i = 1; i < paragraphs.length; i++) {
      if (bodyInlines.length > 0) {
        bodyInlines.push({ type: 'text', value: '\n' })
      }
      bodyInlines.push(...phrasingToInlines(paragraphs[i]!.children))
    }
    return [block({
      type: 'callout',
      calloutKind: kind,
      text: title,
      inlines: bodyInlines.length > 0 ? bodyInlines : [{ type: 'text', value: '' }],
    })]
  }

  const inlines: InlineNode[] = []
  for (const paragraph of paragraphs) {
    if (inlines.length > 0) {
      inlines.push({ type: 'text', value: '\n' })
    }
    inlines.push(...phrasingToInlines(paragraph.children))
  }
  return [block({ type: 'blockquote', inlines })]
}

/**
 * Flatten a mdast list tree into one top-level list block per item (Notion-style).
 * Nested lists become siblings with a higher `indent`.
 */
function flattenList(list: List, depth: number): BlockNode[] {
  const result: BlockNode[] = []
  for (const item of list.children) {
    const isTask = item.checked === true || item.checked === false
    const type = isTask
      ? 'taskList'
      : list.ordered
        ? 'orderedList'
        : 'bulletList'
    result.push(...flattenListItem(item, type, depth))
  }
  return result
}

function flattenListItem(
  item: ListItem,
  type: 'bulletList' | 'orderedList' | 'taskList',
  depth: number,
): BlockNode[] {
  const result: BlockNode[] = []
  let paragraphInlines: InlineNode[] | null = null
  const nestedLists: List[] = []
  const otherBlocks: BlockNode[] = []

  for (const child of item.children) {
    if (child.type === 'paragraph') {
      if (paragraphInlines === null) {
        paragraphInlines = phrasingToInlines(child.children)
      }
      else {
        paragraphInlines = [
          ...paragraphInlines,
          { type: 'text', value: '\n' },
          ...phrasingToInlines(child.children),
        ]
      }
    }
    else if (child.type === 'list') {
      nestedLists.push(child)
    }
    else {
      otherBlocks.push(...blockFromTopLevel(child as Content))
    }
  }

  result.push(block({
    type,
    indent: depth,
    checked: type === 'taskList' ? Boolean(item.checked) : undefined,
    children: [{
      id: createBlockId(),
      type: 'listItem',
      children: [{
        id: createBlockId(),
        type: 'paragraph',
        inlines: paragraphInlines ?? [{ type: 'text', value: '' }],
      }],
    }],
  }))

  for (const nested of nestedLists) {
    result.push(...flattenList(nested, depth + 1))
  }

  result.push(...otherBlocks)
  return result
}

function tableToRows(node: { children: Array<{ children: TableCell[] }> }): TableRow[] {
  return node.children.map(row => ({
    cells: row.children.map(cell => phrasingToInlines(cell.children as PhrasingContent[])),
  }))
}

export function phrasingToInlines(nodes: PhrasingContent[]): InlineNode[] {
  return nodes.flatMap(node => {
    const converted = phrasingToInline(node)
    if (!converted) {
      return []
    }
    return Array.isArray(converted) ? converted : [converted]
  })
}

function phrasingToInline(node: PhrasingContent): InlineNode | InlineNode[] | null {
  switch (node.type) {
    case 'text':
      return expandTextWithWikilinks(node.value)
    case 'strong':
      return {
        type: 'strong',
        value: '',
        children: phrasingToInlines(node.children),
      }
    case 'emphasis':
      return {
        type: 'emphasis',
        value: '',
        children: phrasingToInlines(node.children),
      }
    case 'inlineCode':
      return { type: 'inlineCode', value: node.value }
    case 'link':
      return {
        type: 'link',
        value: '',
        url: node.url,
        children: phrasingToInlines(node.children),
      }
    case 'image':
      return { type: 'text', value: `![${node.alt ?? ''}](${node.url})` }
    case 'break':
      return { type: 'text', value: '\n' }
    default:
      return null
  }
}
