import type { InlineNode } from './types'
import { notePageLinkToMarkdown } from './note-page-links'

/** Foam/Obsidian-style wikilink pattern (matches apps/web/server/vault/wikilinks.ts). */
export const WIKILINK_RE = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

/** Split plain text into text + wikilink inline nodes. */
export function expandTextWithWikilinks(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let lastIndex = 0
  for (const match of text.matchAll(WIKILINK_RE)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      nodes.push({ type: 'text', value: text.slice(lastIndex, index) })
    }
    nodes.push({
      type: 'wikilink',
      value: match[2]?.trim() ?? match[1]!.trim(),
      target: match[1]!.trim(),
      alias: match[2]?.trim(),
    })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', value: text.slice(lastIndex) })
  }
  if (nodes.length === 0) {
    nodes.push({ type: 'text', value: text })
  }
  return nodes
}

export function wikilinkToMarkdown(node: InlineNode): string {
  return notePageLinkToMarkdown(node)
}
