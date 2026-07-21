import { describe, expect, it } from 'vitest'
import { inlinesToMarkdown } from './inlines'
import { selectionHasMark, toggleMark, wrapLink, wrapWikilink } from './inline-marks'
import type { InlineNode } from './types'

const plain = (value: string): InlineNode[] => [{ type: 'text', value }]

describe('toggleMark', () => {
  it('wraps selection in strong', () => {
    const next = toggleMark(plain('hello'), 0, 5, 'strong')
    expect(inlinesToMarkdown(next)).toBe('**hello**')
  })

  it('unwraps when selection already strong', () => {
    const start: InlineNode[] = [{
      type: 'strong',
      value: '',
      children: [{ type: 'text', value: 'hello' }],
    }]
    expect(selectionHasMark(start, 0, 5, 'strong')).toBe(true)
    expect(inlinesToMarkdown(toggleMark(start, 0, 5, 'strong'))).toBe('hello')
  })

  it('wraps partial text', () => {
    const next = toggleMark(plain('abcdef'), 2, 4, 'emphasis')
    expect(inlinesToMarkdown(next)).toBe('ab*cd*ef')
  })

  it('wraps link and wikilink', () => {
    expect(inlinesToMarkdown(wrapLink(plain('n'), 0, 1, 'https://e.dev'))).toBe('[n](https://e.dev)')
    expect(inlinesToMarkdown(wrapWikilink(plain('n'), 0, 1, 'foam/index'))).toContain('[[foam/index')
  })
})
