import matter from 'gray-matter'
import { remark } from 'remark'
import type { Root } from 'mdast'

export interface ParsedNote {
  /** Frontmatter fields (date, tags, statut, ...) — an untyped bag, the vault doesn't enforce a schema. */
  frontmatter: Record<string, unknown>
  /** Raw markdown body, frontmatter stripped. */
  content: string
  /**
   * mdast AST of `content`. Reused for both indexing (wikilink extraction, issue #11)
   * and viewer rendering (issue #17) — see the P0 plan: deliberately not a second,
   * independent markdown -> HTML renderer.
   */
  ast: Root
}

const processor = remark()

/**
 * Parses a single note's raw file content into frontmatter + markdown AST.
 * Read-only: never touches disk, has no knowledge of file paths.
 */
export function parseNote(raw: string): ParsedNote {
  const { data, content } = matter(raw)
  const ast = processor.parse(content)
  return { frontmatter: data, content, ast }
}
