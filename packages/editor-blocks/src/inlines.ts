import { phrasingToInlines } from './mdast-to-blocks'
import { markdownProcessor } from './remark'
import type { InlineNode } from './types'
import { wikilinkToMarkdown } from './wikilinks'

export function inlinesToMarkdown(inlines: InlineNode[]): string {
  return inlines.map(inlineToMarkdown).join('')
}

function inlineToMarkdown(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value
    case 'strong':
      return `**${serializeInlineChildren(node)}**`
    case 'emphasis':
      return `*${serializeInlineChildren(node)}*`
    case 'inlineCode':
      return `\`${node.value}\``
    case 'link':
      return `[${serializeInlineChildren(node)}](${node.url ?? ''})`
    case 'wikilink':
      return wikilinkToMarkdown(node)
    default: {
      const _exhaustive: never = node.type
      return _exhaustive
    }
  }
}

function serializeInlineChildren(node: InlineNode): string {
  if (node.children?.length) {
    return inlinesToMarkdown(node.children)
  }
  return node.value
}

/** Parse a one-line markdown fragment into inline nodes (paragraph / heading edit). */
export function parseInlineMarkdown(fragment: string): InlineNode[] {
  const trimmed = fragment.trim()
  if (!trimmed) {
    return [{ type: 'text', value: '' }]
  }
  const ast = markdownProcessor.parse(trimmed)
  const first = ast.children[0]
  if (first?.type === 'paragraph') {
    return phrasingToInlines(first.children)
  }
  if (first?.type === 'heading') {
    return phrasingToInlines(first.children)
  }
  return [{ type: 'text', value: trimmed }]
}
