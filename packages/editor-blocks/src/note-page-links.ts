import type { BlockNode, InlineNode } from './types'

/** Markdown link to an in-app note page. */
export const NOTE_PAGE_LINK_LINE_RE = /^\[([^\]]+)\]\(\/notes\/([^)]+)\)$/

export function parseNotePageLinkUrl(url: string): string | null {
  const match = url.match(/^\/notes\/(.+)$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function notePageLinkLabel(node: InlineNode): string {
  if (node.children?.length) {
    return node.children.map(child => child.value).join('')
  }
  return node.value
}

export function notePageLinkToMarkdown(node: InlineNode): string {
  const target = node.target ?? node.value
  const label = node.alias ?? notePageLinkLabel(node) ?? target
  return `[${label}](/notes/${target})`
}

function wikilinkInlineToNoteLink(inline: InlineNode): InlineNode {
  return {
    type: 'wikilink',
    target: inline.target ?? inline.value,
    value: inline.alias ?? inline.value,
    alias: inline.alias,
  }
}

function markdownLinkToWikilinkInline(link: InlineNode, target: string): InlineNode {
  const label = notePageLinkLabel(link) || target
  return {
    type: 'wikilink',
    target,
    value: label,
    alias: label !== target ? label : undefined,
  }
}

/** When a paragraph is only a note reference, promote it to a dedicated noteLink block. */
export function promoteInlinesToNoteLink(inlines: InlineNode[]): Omit<BlockNode, 'id'> | null {
  if (inlines.length === 1 && inlines[0]?.type === 'wikilink') {
    return { type: 'noteLink', inlines: [wikilinkInlineToNoteLink(inlines[0])] }
  }

  if (inlines.length === 1 && inlines[0]?.type === 'link') {
    const target = parseNotePageLinkUrl(inlines[0].url ?? '')
    if (target) {
      return {
        type: 'noteLink',
        inlines: [markdownLinkToWikilinkInline(inlines[0], target)],
      }
    }
  }

  return null
}

export function parseNoteLinkLine(text: string): InlineNode[] | null {
  const trimmed = text.trim()
  const match = trimmed.match(NOTE_PAGE_LINK_LINE_RE)
  if (!match?.[1] || !match[2]) return null
  const label = match[1]
  const target = match[2]
  return [{
    type: 'wikilink',
    target,
    value: label,
    alias: label !== target ? label : undefined,
  }]
}
