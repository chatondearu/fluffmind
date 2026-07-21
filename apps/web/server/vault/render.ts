import type { Root } from 'mdast'
import { unified } from 'unified'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'

interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: Array<HastElement | { type: string, value?: string }>
}

function rehypeMermaidPre() {
  return (tree: unknown) => {
    visit(tree as never, 'element', (node: HastElement) => {
      if (node.tagName !== 'pre') return
      const code = node.children.find((child): child is HastElement => {
        return child.type === 'element' && 'tagName' in child && child.tagName === 'code'
      })
      if (!code) return
      const className = code.properties?.className
      const classes = Array.isArray(className)
        ? className.map(String)
        : typeof className === 'string'
          ? [className]
          : []
      if (!classes.some(c => c === 'language-mermaid' || c === 'mermaid')) return
      node.properties = {
        ...node.properties,
        className: ['mermaid'],
      }
      node.children = code.children
    })
  }
}

const htmlProcessor = unified()
  .use(remarkRehype)
  .use(rehypeMermaidPre)
  .use(rehypeStringify)

/**
 * Renders a note's mdast AST to an HTML string. Deliberately generic/unaware of
 * wikilinks — the viewer page (issue #17) transforms `[[...]]` text nodes into real
 * links itself, using the index's already-resolved link data, before calling this.
 *
 * Mermaid fences become `<pre class="mermaid">…</pre>` for client-side hydration.
 */
export function renderNoteHtml(ast: Root): string {
  return htmlProcessor.stringify(htmlProcessor.runSync(ast)) as string
}
