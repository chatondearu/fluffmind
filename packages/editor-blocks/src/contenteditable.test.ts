// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { setSelectionOffset } from './contenteditable'
import { writeInlinesToDom } from './inline-dom'
import type { InlineNode } from './types'

document.execCommand = (_command, _showUi, value = '') => {
  const range = window.getSelection()!.getRangeAt(0)
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    ;(range.startContainer as Text).insertData(range.startOffset, value)
    return true
  }

  // Match browser behavior at an element boundary immediately after a mark.
  const previous = range.startContainer.childNodes[range.startOffset - 1]
  const target = previous instanceof Element && previous.matches('strong, b, em, i, code, a')
    ? previous.lastChild
    : null
  if (target?.nodeType === Node.TEXT_NODE) {
    ;(target as Text).appendData(value)
  }
  return true
}

describe('setSelectionOffset', () => {
  it('inserts typed text outside a terminal mark when the offset reaches its end', () => {
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
    document.execCommand('insertText', false, 'z')

    expect(root.querySelector('strong')?.textContent).toBe('hi')
    expect(root.querySelector('strong')?.nextSibling?.textContent).toBe('z')
  })

  it('inserts typed text into the text sibling following a mark', () => {
    const root = document.createElement('div')
    const inlines: InlineNode[] = [
      {
        type: 'strong',
        value: '',
        children: [{ type: 'text', value: 'ok' }],
      },
      { type: 'text', value: '' },
    ]
    writeInlinesToDom(root, inlines)

    setSelectionOffset(root, 2)
    document.execCommand('insertText', false, 'z')

    expect(root.querySelector('strong')?.textContent).toBe('ok')
    expect(root.querySelector('strong')?.nextSibling?.textContent).toBe('z')
  })
})
