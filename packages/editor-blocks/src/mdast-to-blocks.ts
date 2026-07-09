import type { Content, ListItem, PhrasingContent, Root } from 'mdast'

import type { BlockNode, InlineNode } from './types.ts'

/** Convert a remark mdast root into the spike block tree. */
export function mdastToBlocks(ast: Root): BlockNode[] {
  return ast.children.flatMap(node => blockFromTopLevel(node))
}

function blockFromTopLevel(node: Content): BlockNode[] {
  switch (node.type) {
    case 'paragraph':
      return [{ type: 'paragraph', inlines: phrasingToInlines(node.children) }]
    case 'heading':
      return [{
        type: 'heading',
        level: node.depth,
        inlines: phrasingToInlines(node.children),
      }]
    case 'list':
      return [{
        type: node.ordered ? 'orderedList' : 'bulletList',
        children: node.children.map(listItemToBlock),
      }]
    case 'code':
      return [{
        type: 'code',
        lang: node.lang ?? null,
        text: node.value.replace(/\n$/, ''),
      }]
    default:
      return [{ type: 'fallback', raw: `[unsupported:${node.type}]` }]
  }
}

function listItemToBlock(item: ListItem): BlockNode {
  const nested: BlockNode[] = []
  for (const child of item.children) {
    if (child.type === 'paragraph') {
      nested.push({ type: 'paragraph', inlines: phrasingToInlines(child.children) })
    }
    else if (child.type === 'list') {
      nested.push({
        type: child.ordered ? 'orderedList' : 'bulletList',
        children: child.children.map(listItemToBlock),
      })
    }
    else {
      nested.push(...blockFromTopLevel(child as Content))
    }
  }
  return { type: 'listItem', children: nested }
}

function phrasingToInlines(nodes: PhrasingContent[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    const converted = phrasingToInline(node)
    if (converted) {
      out.push(converted)
    }
  }
  return out
}

function phrasingToInline(node: PhrasingContent): InlineNode | null {
  switch (node.type) {
    case 'text':
      return { type: 'text', value: node.value }
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
