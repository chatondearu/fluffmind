// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { domToInlines, writeInlinesToDom } from './inline-dom'
import { inlinesToMarkdown } from './inlines'
import type { InlineNode } from './types'

describe('inline-dom', () => {
  it('round-trips nested marks and text', () => {
    const root = document.createElement('div')
    const inlines: InlineNode[] = [
      { type: 'text', value: 'a' },
      {
        type: 'strong',
        value: '',
        children: [{
          type: 'emphasis',
          value: '',
          children: [{ type: 'text', value: 'b' }],
        }],
      },
      { type: 'inlineCode', value: 'c' },
    ]

    writeInlinesToDom(root, inlines)

    expect(root.querySelector('strong em')?.textContent).toBe('b')
    expect(root.querySelector('code')?.className).toBe('rounded bg-on-surface/8 px-1 font-mono text-[0.9em]')
    expect(inlinesToMarkdown(domToInlines(root))).toBe('a***b***`c`')
  })

  it('round-trips links and wikilinks with styled DOM attributes', () => {
    const root = document.createElement('div')

    writeInlinesToDom(root, [
      {
        type: 'link',
        value: '',
        url: 'https://e.dev',
        children: [{ type: 'text', value: 'n' }],
      },
      { type: 'text', value: ' ' },
      { type: 'wikilink', value: '', target: 'foam/index', alias: 'Home' },
    ])

    const [link, wikilink] = Array.from(root.querySelectorAll('a'))
    expect(link?.className).toBe('text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary')
    expect(link?.target).toBe('_blank')
    expect(link?.rel).toBe('noopener noreferrer')
    expect(wikilink?.dataset.wikilink).toBe('true')
    expect(wikilink?.dataset.target).toBe('foam/index')
    expect(wikilink?.dataset.alias).toBe('Home')
    expect(wikilink?.className).toBe('rounded-sm px-0.5 font-medium underline underline-offset-2 text-primary decoration-primary/40 hover:decoration-primary')

    const markdown = inlinesToMarkdown(domToInlines(root))
    expect(markdown).toContain('[n](https://e.dev)')
    expect(markdown).toContain('[[foam/index|Home]]')
  })

  it('maps browser aliases and line breaks to inline nodes', () => {
    const root = document.createElement('div')
    root.innerHTML = '<b>bold</b><i>italic</i><br>next'

    expect(inlinesToMarkdown(domToInlines(root))).toBe('**bold***italic*\nnext')
  })

  it('prefers wikilink metadata over href and omits an absent alias', () => {
    const root = document.createElement('div')
    root.innerHTML = '<a data-wikilink="true" data-target="target" href="/ignored">target</a>'

    expect(domToInlines(root)).toEqual([{
      type: 'wikilink',
      value: 'target',
      target: 'target',
    }])
  })

  it('treats anchors without href as plain text, not links', () => {
    const root = document.createElement('div')
    root.innerHTML = '<a>label</a>'

    expect(domToInlines(root)).toEqual([{ type: 'text', value: 'label' }])
    expect(inlinesToMarkdown(domToInlines(root))).toBe('label')
  })
})
