import { describe, expect, it } from 'vitest'

import type { NoteSummary } from '../../server/vault/index'

import { buildVaultTree, prefixNoteId, sanitizeFolderQuery } from './vault-tree'

function note(id: string, title = id, frontmatter: Record<string, unknown> = {}): NoteSummary {
  return {
    id,
    title,
    frontmatter,
    filePath: `/vault/${id}.md`,
  }
}

describe('buildVaultTree', () => {
  it('builds nested folders and root pages', () => {
    const tree = buildVaultTree([
      note('welcome', 'Welcome'),
      note('projets/roadmap', 'Roadmap'),
      note('projets/specs', 'Specs'),
      note('inbox', 'Inbox'),
    ])

    expect(tree.map(node => node.name)).toEqual(['projets', 'inbox', 'welcome'])

    const projets = tree.find(node => node.name === 'projets')
    expect(projets?.kind).toBe('folder')
    expect(projets?.children.map(child => child.name)).toEqual(['roadmap', 'specs'])
    expect(projets?.children[0]?.href).toBe('/notes/projets/roadmap')
  })

  it('routes kanban boards to /boards/', () => {
    const tree = buildVaultTree([
      note('boards/sprint', 'Sprint', { 'kanban-plugin': 'board' }),
    ])

    const sprint = tree.find(node => node.name === 'boards')?.children[0]
    expect(sprint?.href).toBe('/boards/boards/sprint')
  })

  it('sorts folders before pages at each level', () => {
    const tree = buildVaultTree([
      note('alpha'),
      note('zeta/folder-note'),
    ])

    expect(tree[0]?.kind).toBe('folder')
    expect(tree[1]?.kind).toBe('page')
  })
})

describe('sanitizeFolderQuery', () => {
  it('accepts valid folder paths', () => {
    expect(sanitizeFolderQuery('projets')).toBe('projets')
    expect(sanitizeFolderQuery('/projets/docs/')).toBe('projets/docs')
  })

  it('rejects unsafe paths', () => {
    expect(sanitizeFolderQuery('../etc')).toBeNull()
    expect(sanitizeFolderQuery('projets/..')).toBeNull()
  })
})

describe('prefixNoteId', () => {
  it('prefixes slug with folder', () => {
    expect(prefixNoteId('my-note', 'projets')).toBe('projets/my-note')
    expect(prefixNoteId('my-note', null)).toBe('my-note')
  })
})
