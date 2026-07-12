import { describe, expect, it } from 'vitest'

import { blockPlainText, setBlockPlainText } from './block-text'
import { createEmptyBlock } from './block-text'
import { notePageLinkToMarkdown } from './note-page-links'

describe('note-page-links', () => {
  it('serializes wikilink inline as markdown note link', () => {
    expect(notePageLinkToMarkdown({
      type: 'wikilink',
      target: 'foo/bar',
      value: 'Bar',
      alias: 'Bar',
    })).toBe('[Bar](/notes/foo/bar)')
  })

  it('preserves markdown link syntax in paragraph plain text', () => {
    const block = setBlockPlainText(
      createEmptyBlock('paragraph'),
      'See [Roadmap](/notes/projets/roadmap) here',
    )
    expect(blockPlainText(block)).toBe('See [Roadmap](/notes/projets/roadmap) here')
  })
})
