// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { setSelectionOffset } from './contenteditable'
import { writeInlinesToDom } from './inline-dom'
import type { InlineNode } from './types'

describe('setSelectionOffset', () => {
  it('places the caret after a mark when the offset reaches its end', () => {
    const root = document.createElement('div')
    const inlines: InlineNode[] = [
      { type: 'text', value: 'say ' },
      {
        type: 'strong',
        value: '',
        children: [{ type: 'text', value: 'hi' }],
      },
    ]
    writeInlinesToDom(root, inlines)

    setSelectionOffset(root, 6)

    const range = window.getSelection()!.getRangeAt(0)
    expect(range.startContainer).toBe(root)
    expect(range.startOffset).toBe(2)
  })
})
