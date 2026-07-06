import { unified } from 'unified'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import type { Root } from 'mdast'

const htmlProcessor = unified().use(remarkRehype).use(rehypeStringify)

/**
 * Renders a note's mdast AST to an HTML string. Deliberately generic/unaware of
 * wikilinks — the viewer page (issue #17) transforms `[[...]]` text nodes into real
 * links itself, using the index's already-resolved link data, before calling this.
 */
export function renderNoteHtml(ast: Root): string {
  return htmlProcessor.stringify(htmlProcessor.runSync(ast))
}
