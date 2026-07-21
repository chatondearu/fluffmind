import { describe, expect, it } from 'vitest'

import { buildNoteSourceFile, parseNoteSourceFile } from './note-source'

describe('note-source utils', () => {
  it('builds and parses frontmatter with body', () => {
    const raw = buildNoteSourceFile({ tags: ['work'] }, '# Hello\n')
    expect(raw.startsWith('---\n')).toBe(true)
    expect(raw).not.toContain('Buffer')
    const parsed = parseNoteSourceFile(raw)
    expect(parsed.error).toBeUndefined()
    expect(parsed.frontmatter).toEqual({ tags: ['work'] })
    expect(parsed.content.trim()).toBe('# Hello')
  })

  it('returns body unchanged when frontmatter is empty', () => {
    expect(buildNoteSourceFile({}, '# Only body\n')).toBe('# Only body\n')
  })

  it('parses notes without frontmatter', () => {
    const parsed = parseNoteSourceFile('# Hello\n\nworld')
    expect(parsed.error).toBeUndefined()
    expect(parsed.frontmatter).toEqual({})
    expect(parsed.content).toBe('# Hello\n\nworld')
  })

  it('returns parse error for invalid yaml', () => {
    const parsed = parseNoteSourceFile('---\nfoo: [1,\n---\nbody')
    expect(parsed.error).toBeTruthy()
    expect(parsed.content).toContain('body')
  })

  it('round-trips description and custom fields used by the properties panel', () => {
    const fm = {
      description: 'A note',
      tags: ['a', 'b'],
      status: 'draft',
    }
    const raw = buildNoteSourceFile(fm, 'Body line\n')
    const parsed = parseNoteSourceFile(raw)
    expect(parsed.error).toBeUndefined()
    expect(parsed.frontmatter).toEqual(fm)
    expect(parsed.content).toBe('Body line\n')
  })
})
