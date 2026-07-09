import type { InlineNode } from './types.ts'

/** Serialize inline nodes back to markdown (P3 spike subset). */
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
