import { describe, expect, it } from 'vitest'
import { applyInputRule, matchInputRule } from './inline-input-rules'

describe('matchInputRule', () => {
  it('matches bold with **', () => {
    expect(matchInputRule('say **hi**', 10)).toEqual({
      kind: 'strong',
      start: 4,
      end: 10,
      content: 'hi',
    })
  })

  it('matches bold with __', () => {
    expect(matchInputRule('__hi__', 6)?.kind).toBe('strong')
  })

  it('matches italic with * without consuming **', () => {
    expect(matchInputRule('x *y*', 5)).toMatchObject({ kind: 'emphasis', content: 'y' })
  })

  it('matches inline code', () => {
    expect(matchInputRule('a `b`', 5)).toMatchObject({ kind: 'inlineCode', content: 'b' })
  })

  it('matches markdown link', () => {
    expect(matchInputRule('[n](https://e.dev)', 18)).toMatchObject({
      kind: 'link',
      content: 'n',
      url: 'https://e.dev',
    })
  })

  it('matches wikilink with alias', () => {
    expect(matchInputRule('[[a|b]]', 7)).toMatchObject({
      kind: 'wikilink',
      target: 'a',
      alias: 'b',
    })
  })

  it('ignores escaped delimiters', () => {
    expect(matchInputRule('a \\*b*', 6)).toBeNull()
  })

  it('returns null when caret is not at end of a match', () => {
    expect(matchInputRule('**hi** there', 12)).toBeNull()
  })
})

describe('applyInputRule', () => {
  it('builds strong inlines and places caret after mark', () => {
    const match = matchInputRule('**hi**', 6)!
    const result = applyInputRule('**hi**', match)
    expect(result.inlines).toEqual([
      { type: 'strong', value: '', children: [{ type: 'text', value: 'hi' }] },
    ])
    expect(result.caret).toBe(2)
  })
})
