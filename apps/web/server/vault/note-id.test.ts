import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'

const vaultPaths: string[] = []

afterEach(async () => {
  await Promise.all(vaultPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('resolveNoteFilePath', () => {
  it('rejects empty ids', () => {
    expect(() => resolveNoteFilePath('/vault', '')).toThrow(InvalidNoteIdError)
    expect(() => resolveNoteFilePath('/vault', '   ')).toThrow(InvalidNoteIdError)
  })

  it('rejects "." and ".." segments', () => {
    expect(() => resolveNoteFilePath('/vault', '..')).toThrow(InvalidNoteIdError)
    expect(() => resolveNoteFilePath('/vault', '.')).toThrow(InvalidNoteIdError)
    expect(() => resolveNoteFilePath('/vault', 'a/../b')).toThrow(InvalidNoteIdError)
    expect(() => resolveNoteFilePath('/vault', 'a/./b')).toThrow(InvalidNoteIdError)
  })

  it('rejects absolute ids', () => {
    expect(() => resolveNoteFilePath('/vault', '/absolute')).toThrow(InvalidNoteIdError)
  })

  it('rejects .md suffix', () => {
    expect(() => resolveNoteFilePath('/vault', 'note.md')).toThrow(InvalidNoteIdError)
    expect(() => resolveNoteFilePath('/vault', 'folder/note.md')).toThrow(InvalidNoteIdError)
  })

  it('rejects ids that escape the vault root', () => {
    expect(() => resolveNoteFilePath('/vault', '../outside')).toThrow(InvalidNoteIdError)
    expect(() => resolveNoteFilePath('/vault', 'foo/../../outside')).toThrow(InvalidNoteIdError)
  })

  it('accepts a nested id under the vault root', async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-note-id-'))
    vaultPaths.push(vaultPath)

    expect(resolveNoteFilePath(vaultPath, 'projets/index')).toBe(
      resolve(join(vaultPath, 'projets', 'index.md')),
    )
  })
})
