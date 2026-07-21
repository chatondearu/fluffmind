import { phrasingToInlines } from './mdast-to-blocks'
import { markdownProcessor } from './remark'
import type { InlineNode } from './types'
import { wikilinkToMarkdown } from './wikilinks'

const CARET_ARTIFACT_PATTERN = /\u200b/g

export function inlinesToMarkdown(inlines: InlineNode[]): string {
  return inlines.map(inlineToMarkdown).join('')
}

/** Remove invisible caret anchors before exposing editor state. */
export function stripCaretArtifacts(inlines: InlineNode[]): InlineNode[] {
  return inlines.map(node => ({
    ...node,
    value: node.type === 'text' ? node.value.replace(CARET_ARTIFACT_PATTERN, '') : node.value,
    ...(node.children ? { children: stripCaretArtifacts(node.children) } : {}),
  }))
}

/** Plain visible text for empty checks / caret length (walks nested marks). */
export function inlinesToPlainText(inlines: InlineNode[]): string {
  return inlines.map(inlinePlainText).join('')
}

function inlinePlainText(node: InlineNode): string {
  if (node.children?.length) {
    return inlinesToPlainText(node.children)
  }
  return node.value
}

function inlineToMarkdown(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value.replace(CARET_ARTIFACT_PATTERN, '')
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

function parseSingleLineMarkdown(fragment: string): InlineNode[] {
  if (!fragment) {
    return [{ type: 'text', value: '' }]
  }

  const leading = fragment.match(/^\s*/)?.[0] ?? ''
  const trailing = leading.length === fragment.length
    ? ''
    : fragment.match(/\s*$/)?.[0] ?? ''
  const core = fragment.slice(leading.length, fragment.length - trailing.length || undefined)
  if (!core) {
    return [{ type: 'text', value: fragment }]
  }

  const ast = markdownProcessor.parse(core)
  const first = ast.children[0]
  let parsed: InlineNode[]
  if (first?.type === 'paragraph') {
    parsed = phrasingToInlines(first.children)
  }
  else if (first?.type === 'heading') {
    // Keep ATX markers editable as plain text for promote-on-blur.
    parsed = [{ type: 'text', value: core }]
  }
  else {
    parsed = [{ type: 'text', value: core }]
  }

  const nodes: InlineNode[] = []
  if (leading) nodes.push({ type: 'text', value: leading })
  nodes.push(...parsed)
  if (trailing) nodes.push({ type: 'text', value: trailing })
  return nodes
}

/** Parse a markdown fragment into inline nodes (paragraph / heading / list item edit). */
export function parseInlineMarkdown(fragment: string): InlineNode[] {
  if (!fragment.includes('\n')) {
    if (!fragment.trim()) {
      return [{ type: 'text', value: fragment }]
    }
    return parseSingleLineMarkdown(fragment)
  }

  const lines = fragment.split('\n')
  const nodes: InlineNode[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      nodes.push({ type: 'text', value: '\n' })
    }
    nodes.push(...parseSingleLineMarkdown(lines[i]!))
  }
  return nodes.length > 0 ? nodes : [{ type: 'text', value: '' }]
}

/** True when inlines contain a link, wikilink, or mark worth a rich preview. */
export function hasRichInlines(inlines: InlineNode[]): boolean {
  return inlines.some((node) => {
    if (node.type === 'link' || node.type === 'wikilink' || node.type === 'strong' || node.type === 'emphasis' || node.type === 'inlineCode') {
      return true
    }
    return Boolean(node.children && hasRichInlines(node.children))
  })
}
