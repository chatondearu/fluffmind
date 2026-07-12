import { describe, expect, it } from 'vitest'

import { buildNoteSourceFile, parseNoteSourceFile } from './note-source'

describe('note-source utils', () => {
  it('builds and parses frontmatter with body', () => {
    const raw = buildNoteSourceFile({ tags: ['work'] }, '# Hello\n')
    const parsed = parseNoteSourceFile(raw)
    expect(parsed.error).toBeUndefined()
    expect(parsed.frontmatter).toEqual({ tags: ['work'] })
    expect(parsed.content.trim()).toBe('# Hello')
  })

  it('returns parse error for invalid yaml', () => {
    const parsed = parseNoteSourceFile('---\n: bad\n---\nbody')
    expect(parsed.error).toBeTruthy()
    expect(parsed.content).toContain('body')
  })
})
