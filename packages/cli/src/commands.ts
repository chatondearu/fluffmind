import type { FluffmindClient } from './client.ts'
import { readFile } from 'node:fs/promises'

/** Thrown for bad CLI invocations (unknown command, missing args) — mapped to exit 2. */
export class CliUsageError extends Error {}

export interface CommandFlags {
  file?: string
  stdin?: boolean
  limit?: string
  note?: string
}

const COMMANDS = ['whoami', 'search', 'read', 'write', 'backlinks', 'graph', 'task', 'config'] as const
export type CommandName = (typeof COMMANDS)[number]

export function isCommandName(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value)
}

/** Dispatches a parsed subcommand to the client. `config` is handled by the caller (no client needed). */
export async function runCommand(command: CommandName, args: string[], client: FluffmindClient, flags: CommandFlags): Promise<unknown> {
  switch (command) {
    case 'whoami':
      return client.whoami()

    case 'search': {
      const query = args[0]
      if (!query)
        throw new CliUsageError('search requires a query: fluffmind search "<query>" [--limit N]')
      return client.search(query, parseLimit(flags.limit))
    }

    case 'read': {
      const id = requireId(args[0], 'read')
      return client.read(id)
    }

    case 'write': {
      const id = requireId(args[0], 'write')
      const content = await resolveContent(args[1], flags)
      return client.write(id, content)
    }

    case 'backlinks': {
      const id = requireId(args[0], 'backlinks')
      return client.backlinks(id)
    }

    case 'graph':
      return client.graph()

    case 'task': {
      const content = await resolveContent(args[0], flags)
      return client.task(content, flags.note)
    }

    case 'config':
      throw new CliUsageError('config is handled without a client')
  }
}

function requireId(id: string | undefined, command: string): string {
  if (!id)
    throw new CliUsageError(`${command} requires a note id`)
  return id
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined)
    return undefined
  const limit = Number.parseInt(raw, 10)
  if (!Number.isFinite(limit))
    throw new CliUsageError(`invalid --limit: ${raw}`)
  return limit
}

/** Content precedence: `--file` > `--stdin` > positional argument. */
async function resolveContent(positional: string | undefined, flags: CommandFlags): Promise<string> {
  if (flags.file)
    return readFile(flags.file, 'utf-8')
  if (flags.stdin)
    return readStdin()
  if (positional !== undefined)
    return positional
  throw new CliUsageError('missing content: pass it as an argument, or use --file <path> / --stdin')
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}
