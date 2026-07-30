import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildVaultIndex } from './index'

const vaultPaths: string[] = []

afterEach(async () => {
  await Promise.all(vaultPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('buildVaultIndex', () => {
  it('indexes only configured content roots while keeping ids relative to the vault root', async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-index-'))
    vaultPaths.push(vaultPath)

    await Promise.all([
      mkdir(join(vaultPath, 'foam'), { recursive: true }),
      mkdir(join(vaultPath, 'docs'), { recursive: true }),
      mkdir(join(vaultPath, 'src'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(join(vaultPath, 'foam/a.md'), '# Foam\n'),
      writeFile(join(vaultPath, 'docs/b.md'), '# Docs\n'),
      writeFile(join(vaultPath, 'src/c.md'), '# Source\n'),
    ])

    const filteredIndex = await buildVaultIndex(vaultPath, ['foam', 'docs'])
    const fullIndex = await buildVaultIndex(vaultPath)

    expect([...filteredIndex.notes.keys()].sort()).toEqual(['docs/b', 'foam/a'])
    expect(fullIndex.notes.has('src/c')).toBe(true)
  })
})
