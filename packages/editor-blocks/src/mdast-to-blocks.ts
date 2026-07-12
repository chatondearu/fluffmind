import type { Content, ListItem, PhrasingContent, Root, TableCell } from 'mdast'

import { createBlockId } from './ids'
import { promoteInlinesToNoteLink } from './note-page-links'
import type { BlockNode, InlineNode, TableRow } from './types'
import { expandTextWithWikilinks } from './wikilinks'

function block(partial: Omit<BlockNode, 'id'> & { id?: string }): BlockNode {
  return { id: partial.id ?? createBlockId(), ...partial }
}

/** Convert a remark mdast root into block nodes (#57). */
export function mdastToBlocks(ast: Root): BlockNode[] {
  return ast.children.flatMap(node => blockFromTopLevel(node))
}

function blockFromTopLevel(node: Content): BlockNode[] {
  switch (node.type) {
    case 'paragraph': {
      const inlines = phrasingToInlines(node.children)
      const noteLink = promoteInlinesToNoteLink(inlines)
      if (noteLink) {
        return [block(noteLink)]
      }
      return [block({ type: 'paragraph', inlines })]
    }
    case 'heading':
      return [block({
        type: 'heading',
        level: node.depth,
        inlines: phrasingToInlines(node.children),
      })]
    case 'list':
      return [block({
        type: node.ordered ? 'orderedList' : 'bulletList',
        children: node.children.map(listItemToBlock),
      })]
    case 'code':
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
    default:
      return [block({ type: 'fallback', raw: `[unsupported:${node.type}]` })]
  }
}

function tableToRows(node: { children: Array<{ children: TableCell[] }> }): TableRow[] {
  return node.children.map(row => ({
    cells: row.children.map(cell => phrasingToInlines(cell.children as PhrasingContent[])),
  }))
}

function listItemToBlock(item: ListItem): BlockNode {
  const nested: BlockNode[] = []
  for (const child of item.children) {
    if (child.type === 'paragraph') {
      nested.push(block({ type: 'paragraph', inlines: phrasingToInlines(child.children) }))
    }
    else if (child.type === 'list') {
      nested.push(block({
        type: child.ordered ? 'orderedList' : 'bulletList',
        children: child.children.map(listItemToBlock),
      }))
    }
    else {
      nested.push(...blockFromTopLevel(child as Content))
    }
  }
  return block({ type: 'listItem', children: nested })
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
    case 'break':
      return { type: 'text', value: '\n' }
    default:
      return null
  }
}
