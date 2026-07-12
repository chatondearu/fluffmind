import { dump, load } from 'js-yaml'

export interface ParsedNoteSource {
  frontmatter: Record<string, unknown>
  content: string
  error?: string
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function buildNoteSourceFile(frontmatter: Record<string, unknown>, content: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return content
  }
  const yamlBody = dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd()
  return `---\n${yamlBody}\n---\n${content}`
}

export function parseNoteSourceFile(raw: string): ParsedNoteSource {
  const match = raw.match(FRONTMATTER_REGEX)
  if (!match) {
    return { frontmatter: {}, content: raw }
  }

  const yamlBlock = match[1] ?? ''
  const content = match[2] ?? ''

  try {
    const data = load(yamlBlock)
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      return { frontmatter: data as Record<string, unknown>, content }
    }
    return {
      frontmatter: {},
      content: raw,
      error: 'Frontmatter must be a YAML mapping',
    }
  } catch (error) {
    return {
      frontmatter: {},
      content: raw,
      error: error instanceof Error ? error.message : 'Invalid YAML frontmatter',
    }
  }
}
