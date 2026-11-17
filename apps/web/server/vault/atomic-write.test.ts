import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileAtomic } from './atomic-write'

describe('writeFileAtomic', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fluffmind-atomic-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('replaces the file, applies mtime and leaves no temp file', async () => {
    const file = join(dir, 'a.md')
    await writeFileAtomic(file, 'one')
    await writeFileAtomic(file, 'two', new Date(1_700_000_000_000))

    expect(await readFile(file, 'utf-8')).toBe('two')
    expect(Math.trunc((await stat(file)).mtimeMs)).toBe(1_700_000_000_000)
    expect(await readdir(dir)).toEqual(['a.md'])
  })

  it('cleans up the temp file when the rename fails', async () => {
    await expect(writeFileAtomic(join(dir, 'missing', 'a.md'), 'x')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readdir(dir)).toEqual([])
  })
})
