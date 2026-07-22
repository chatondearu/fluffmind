import { describe, expect, it } from 'vitest'

import { autosaveSnapshot, frontmatterEqual, shouldAutosave } from './note-autosave'
import { buildNoteSourceFile, parseNoteSourceFile } from './note-source'

describe('note-autosave dirty checks', () => {
  it('shouldAutosave is false when snapshot is unchanged', () => {
    const snapshot = autosaveSnapshot({ content: '# Hello\n', frontmatter: { tags: ['a'] } })
    expect(shouldAutosave(snapshot, snapshot)).toBe(false)
  })

  it('shouldAutosave is true when content changed', () => {
    const previous = autosaveSnapshot({ content: '# Hello\n', frontmatter: {} })
    const next = autosaveSnapshot({ content: '# Hello world\n', frontmatter: {} })
    expect(shouldAutosave(next, previous)).toBe(true)
  })

  it('shouldAutosave is true when only frontmatter changed', () => {
    const previous = autosaveSnapshot({ content: '# Hello\n', frontmatter: { tags: ['a'] } })
    const next = autosaveSnapshot({ content: '# Hello\n', frontmatter: { tags: ['b'] } })
    expect(shouldAutosave(next, previous)).toBe(true)
  })

  it('shouldAutosave is true when there is no previous snapshot yet', () => {
    const next = autosaveSnapshot({ content: '# Hello\n' })
    expect(shouldAutosave(next, null)).toBe(true)
  })

  it('frontmatterEqual ignores object identity', () => {
    expect(frontmatterEqual({ tags: ['work'] }, { tags: ['work'] })).toBe(true)
    expect(frontmatterEqual({ tags: ['work'] }, { tags: ['home'] })).toBe(false)
  })

  it('source file round-trip produces the same autosave snapshot (mode switch is not dirty)', () => {
    const payload = {
      content: '# Hello\n\nBody\n',
      frontmatter: { tags: ['work'] },
    }
    const baseline = autosaveSnapshot(payload)
    const raw = buildNoteSourceFile(payload.frontmatter, payload.content)
    const parsed = parseNoteSourceFile(raw)
    expect(parsed.error).toBeUndefined()
    const fromSource = autosaveSnapshot({
      content: parsed.content,
      frontmatter: parsed.frontmatter,
    })
    expect(shouldAutosave(fromSource, baseline)).toBe(false)
  })
})
