import matter from 'gray-matter'

export interface ParsedNoteSource {
  frontmatter: Record<string, unknown>
  content: string
  error?: string
}

export function buildNoteSourceFile(frontmatter: Record<string, unknown>, content: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return content
  }
  return matter.stringify(content, frontmatter)
}

export function parseNoteSourceFile(raw: string): ParsedNoteSource {
  try {
    const { data, content } = matter(raw)
    return { frontmatter: data as Record<string, unknown>, content }
  } catch (error) {
    return {
      frontmatter: {},
      content: raw,
      error: error instanceof Error ? error.message : 'Invalid YAML frontmatter',
    }
  }
}
