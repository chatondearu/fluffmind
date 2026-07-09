import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { invalidateVaultIndex } from '../vault/service'
import { DEFAULT_MCP_WORKSPACE_ID } from './context'
import {
  createTask,
  getVaultGraph,
  listBacklinks,
  readNoteById,
  searchNotes,
  writeNoteContent,
} from './handlers'

const ctx = { workspaceId: DEFAULT_MCP_WORKSPACE_ID }
let vaultPath = ''
let previousVaultPath: string | undefined

async function writeVaultNote(relativePath: string, content: string) {
  const filePath = join(vaultPath, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
}

beforeEach(async () => {
  previousVaultPath = process.env.VAULT_PATH
  vaultPath = await mkdtemp(join(tmpdir(), 'fluffmind-mcp-'))
  process.env.VAULT_PATH = vaultPath
  invalidateVaultIndex()

  await writeVaultNote('alpha.md', '# Alpha\n\nLink to [[beta]].\n')
  await writeVaultNote('beta.md', '# Beta\n\nBacklink target.\n')
  invalidateVaultIndex()
})

afterEach(() => {
  if (previousVaultPath === undefined) {
    delete process.env.VAULT_PATH
  } else {
    process.env.VAULT_PATH = previousVaultPath
  }
  invalidateVaultIndex()
})

describe('mcp handlers', () => {
  it('search_notes matches title and id', async () => {
    const results = await searchNotes('alpha')
    expect(results).toEqual([{ id: 'alpha', title: 'Alpha' }])
  })

  it('read_note returns markdown content', async () => {
    const note = await readNoteById('beta')
    expect(note?.title).toBe('Beta')
    expect(note?.content).toContain('Backlink target.')
  })

  it('list_backlinks resolves wikilinks', async () => {
    const backlinks = await listBacklinks('beta')
    expect(backlinks).toEqual([{ id: 'alpha', title: 'Alpha' }])
  })

  it('get_graph returns nodes and edges', async () => {
    const graph = await getVaultGraph()
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['alpha', 'beta'])
    expect(graph.edges).toEqual([{ source: 'alpha', target: 'beta' }])
  })

  it('write_note persists content', async () => {
    await writeNoteContent(ctx, 'gamma', '# Gamma\n\nCreated via MCP.\n')
    invalidateVaultIndex()
    const note = await readNoteById('gamma')
    expect(note?.content).toContain('Created via MCP.')
  })

  it('create_task appends checkbox to default inbox note', async () => {
    await createTask(ctx, 'Ship MCP')
    invalidateVaultIndex()
    const note = await readNoteById('inbox/tasks')
    expect(note?.content).toContain('- [ ] Ship MCP')
  })
})
