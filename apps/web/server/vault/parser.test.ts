import { describe, expect, it } from 'vitest'

import { parseNote, serializeNoteFile } from './parser'

describe('serializeNoteFile', () => {
  it('returns body-only content when frontmatter is empty', () => {
    expect(serializeNoteFile('# Hello\n', {})).toBe('# Hello\n')
  })

  it('round-trips frontmatter with parseNote', () => {
    const raw = serializeNoteFile('# Body\n', { tags: ['work'], status: 'draft' })
    const parsed = parseNote(raw)
    expect(parsed.content).toBe('# Body\n')
    expect(parsed.frontmatter).toEqual({ tags: ['work'], status: 'draft' })
  })

  it('preserves frontmatter when only body changes', () => {
    const initial = serializeNoteFile('v1', { tags: ['a'] })
    const parsed = parseNote(initial)
    const updated = serializeNoteFile('v2', parsed.frontmatter)
    expect(parseNote(updated).frontmatter).toEqual({ tags: ['a'] })
    expect(parseNote(updated).content.trimEnd()).toBe('v2')
  })
})
