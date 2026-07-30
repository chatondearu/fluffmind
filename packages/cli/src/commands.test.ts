import type { Mock } from 'vitest'
import type { FluffmindClient } from './client.ts'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CliUsageError, isCommandName, runCommand } from './commands.ts'

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }))

function fakeClient(): { [K in keyof FluffmindClient]: Mock } {
  return {
    whoami: vi.fn().mockResolvedValue({ id: 'org_1' }),
    search: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue({ id: 'alpha' }),
    write: vi.fn().mockResolvedValue({ committed: true }),
    backlinks: vi.fn().mockResolvedValue([]),
    graph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    task: vi.fn().mockResolvedValue({ noteId: 'inbox' }),
  } as unknown as { [K in keyof FluffmindClient]: Mock }
}

describe('isCommandName', () => {
  it('accepts the eight known commands', () => {
    for (const name of ['whoami', 'search', 'read', 'write', 'backlinks', 'graph', 'task', 'config'])
      expect(isCommandName(name)).toBe(true)
  })

  it('rejects unknown commands', () => {
    expect(isCommandName('delete')).toBe(false)
  })
})

describe('runCommand', () => {
  let client: ReturnType<typeof fakeClient>

  beforeEach(() => {
    client = fakeClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('whoami calls client.whoami with no args', async () => {
    const result = await runCommand('whoami', [], client as unknown as FluffmindClient, {})
    expect(client.whoami).toHaveBeenCalledWith()
    expect(result).toEqual({ id: 'org_1' })
  })

  it('search passes the query and parsed --limit', async () => {
    await runCommand('search', ['alpha'], client as unknown as FluffmindClient, { limit: '5' })
    expect(client.search).toHaveBeenCalledWith('alpha', 5)
  })

  it('search omits limit when --limit is not given', async () => {
    await runCommand('search', ['alpha'], client as unknown as FluffmindClient, {})
    expect(client.search).toHaveBeenCalledWith('alpha', undefined)
  })

  it('search without a query throws CliUsageError', async () => {
    await expect(runCommand('search', [], client as unknown as FluffmindClient, {})).rejects.toThrow(CliUsageError)
  })

  it('search rejects a non-numeric --limit', async () => {
    await expect(runCommand('search', ['alpha'], client as unknown as FluffmindClient, { limit: 'abc' })).rejects.toThrow(CliUsageError)
  })

  it('read requires an id', async () => {
    await expect(runCommand('read', [], client as unknown as FluffmindClient, {})).rejects.toThrow(CliUsageError)
  })

  it('read passes the id through', async () => {
    await runCommand('read', ['projects/beta'], client as unknown as FluffmindClient, {})
    expect(client.read).toHaveBeenCalledWith('projects/beta')
  })

  it('write uses the positional content by default', async () => {
    await runCommand('write', ['alpha', '# Alpha'], client as unknown as FluffmindClient, {})
    expect(client.write).toHaveBeenCalledWith('alpha', '# Alpha')
  })

  it('write reads content from --file when given, ignoring the positional', async () => {
    vi.mocked(readFile).mockResolvedValue('from file')
    await runCommand('write', ['alpha', 'ignored'], client as unknown as FluffmindClient, { file: 'note.md' })
    expect(readFile).toHaveBeenCalledWith('note.md', 'utf-8')
    expect(client.write).toHaveBeenCalledWith('alpha', 'from file')
  })

  it('write without an id throws CliUsageError', async () => {
    await expect(runCommand('write', [], client as unknown as FluffmindClient, {})).rejects.toThrow(CliUsageError)
  })

  it('write without content, file, or stdin throws CliUsageError', async () => {
    await expect(runCommand('write', ['alpha'], client as unknown as FluffmindClient, {})).rejects.toThrow(CliUsageError)
  })

  it('backlinks passes the id through', async () => {
    await runCommand('backlinks', ['alpha'], client as unknown as FluffmindClient, {})
    expect(client.backlinks).toHaveBeenCalledWith('alpha')
  })

  it('graph calls client.graph with no args', async () => {
    await runCommand('graph', [], client as unknown as FluffmindClient, {})
    expect(client.graph).toHaveBeenCalledWith()
  })

  it('task passes content and --note', async () => {
    await runCommand('task', ['Ship it'], client as unknown as FluffmindClient, { note: 'inbox/tasks' })
    expect(client.task).toHaveBeenCalledWith('Ship it', 'inbox/tasks')
  })

  it('task omits noteId when --note is not given', async () => {
    await runCommand('task', ['Ship it'], client as unknown as FluffmindClient, {})
    expect(client.task).toHaveBeenCalledWith('Ship it', undefined)
  })

  it('task prefers --file over the positional content', async () => {
    vi.mocked(readFile).mockResolvedValue('from file')
    await runCommand('task', ['ignored'], client as unknown as FluffmindClient, { file: 'task.md' })
    expect(client.task).toHaveBeenCalledWith('from file', undefined)
  })

  it('write reads content from --stdin when given', async () => {
    const originalStdin = process.stdin
    Object.defineProperty(process, 'stdin', {
      value: (async function* () { yield Buffer.from('from stdin') })(),
      configurable: true,
    })
    try {
      await runCommand('write', ['alpha'], client as unknown as FluffmindClient, { stdin: true })
      expect(client.write).toHaveBeenCalledWith('alpha', 'from stdin')
    }
    finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true })
    }
  })
})
