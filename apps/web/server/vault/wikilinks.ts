import { visit } from 'unist-util-visit'
import type { Root, Text } from 'mdast'

export interface WikilinkRef {
  /** Raw target as written, e.g. `projets/index` in `[[projets/index]]`. Not yet resolved
   *  against the note index — see server/vault/index.ts for resolution + dead-link detection. */
  target: string
  /** Optional display alias, e.g. `Projets` in `[[projets/index|Projets]]`. */
  alias?: string
}

// [[target]] or [[target|alias]]. remark has no built-in notion of wikilinks, so
// `[[...]]` just ends up as plain text inside paragraph/heading/etc. nodes — this
// regex-scans those text nodes rather than pulling in a wikilink parser plugin
// (evaluated remark-wiki-link; a manual scan keeps full control over the extracted
// shape without depending on a third-party AST node type).
const WIKILINK_RE = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

/**
 * Extracts every `[[...]]` wikilink found anywhere in a note's AST.
 */
export function extractWikilinks(ast: Root): WikilinkRef[] {
  const links: WikilinkRef[] = []
  visit(ast, 'text', (node: Text) => {
    for (const match of node.value.matchAll(WIKILINK_RE)) {
      links.push({
        target: match[1]!.trim(),
        alias: match[2]?.trim()
      })
    }
  })
  return links
}
