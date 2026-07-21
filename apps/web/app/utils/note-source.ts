import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface ParsedNoteSource {
  frontmatter: Record<string, unknown>
  content: string
  error?: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/

/**
 * Build a note file with optional YAML frontmatter.
 * Browser-safe (no gray-matter / Node Buffer).
 */
export function buildNoteSourceFile(frontmatter: Record<string, unknown>, content: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return content
  }
  const yaml = stringifyYaml(frontmatter, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
  }).trimEnd()
  const body = content.replace(/^\r?\n/, '')
  return `---\n${yaml}\n---\n${body}`
}

/**
 * Parse a note file into frontmatter + markdown body.
 * Browser-safe (no gray-matter / Node Buffer).
 */
export function parseNoteSourceFile(raw: string): ParsedNoteSource {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) {
    return { frontmatter: {}, content: raw }
  }

  try {
    const data = parseYaml(match[1] ?? '')
    if (data === null || data === undefined) {
      return { frontmatter: {}, content: match[2] ?? '' }
    }
    if (typeof data !== 'object' || Array.isArray(data)) {
      return {
        frontmatter: {},
        content: raw,
        error: 'Frontmatter must be a YAML mapping',
      }
    }
    return {
      frontmatter: data as Record<string, unknown>,
      content: match[2] ?? '',
    }
  }
  catch (error) {
    return {
      frontmatter: {},
      content: raw,
      error: error instanceof Error ? error.message : 'Invalid YAML frontmatter',
    }
  }
}
