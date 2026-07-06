import { visit } from 'unist-util-visit'
import type { Link, PhrasingContent, Root, Text } from 'mdast'
import type { ResolvedLink } from './index'

const WIKILINK_RE = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

/**
 * Replaces `[[target]]` / `[[target|alias]]` text with real mdast link nodes, using
 * the index's already-resolved link data (no re-resolution here). Dead links (no
 * resolvedId) become a link to nowhere tagged with a `dead-link` class, so the page
 * can style them differently, instead of being silently dropped.
 *
 * Mutates `ast` in place — safe here because the caller (the note detail API route)
 * gets a freshly re-parsed AST per request (see reader.ts), never a shared/cached one.
 */
export function linkifyWikilinks(ast: Root, links: ResolvedLink[]): Root {
  const linkByTarget = new Map(links.map((link) => [link.target, link]))

  visit(ast, 'text', (node: Text, index, parent) => {
    if (parent == null || index == null) return
    WIKILINK_RE.lastIndex = 0
    if (!WIKILINK_RE.test(node.value)) return
    WIKILINK_RE.lastIndex = 0

    const replacement: PhrasingContent[] = []
    let lastIndex = 0
    for (const match of node.value.matchAll(WIKILINK_RE)) {
      const [full, target, alias] = match
      const matchIndex = match.index!
      if (matchIndex > lastIndex) {
        replacement.push({ type: 'text', value: node.value.slice(lastIndex, matchIndex) })
      }
      const resolved = linkByTarget.get(target!.trim())
      const isDead = resolved?.resolvedId == null
      const linkNode: Link = {
        type: 'link',
        url: isDead ? '#' : `/notes/${resolved!.resolvedId}`,
        data: isDead ? { hProperties: { className: ['dead-link'] } } : {},
        children: [{ type: 'text', value: (alias ?? target)!.trim() }]
      }
      replacement.push(linkNode)
      lastIndex = matchIndex + full.length
    }
    if (lastIndex < node.value.length) {
      replacement.push({ type: 'text', value: node.value.slice(lastIndex) })
    }

    parent.children.splice(index, 1, ...replacement)
    return index + replacement.length
  })

  return ast
}
