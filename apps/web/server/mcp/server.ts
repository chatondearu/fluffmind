import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { McpContext } from './context'
import {
  createTask,
  formatHandlerError,
  getVaultGraph,
  listBacklinks,
  readNoteById,
  searchNotes,
  toTextPayload,
  toolError,
  writeNoteContent,
} from './handlers'

const SERVER_INSTRUCTIONS = `Fluffmind vault MCP server. Notes are markdown files in a Git-backed vault.
Use search_notes to find notes, read_note for full content, write_note to persist changes.
Writes commit through the same server path as the web UI (writeToWorkspace).`

export function createFluffmindMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: 'fluffmind', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  )

  server.registerTool(
    'search_notes',
    {
      description: 'Search notes by title or id (case-insensitive).',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search string matched against note title and id'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
      }),
    },
    async ({ query, limit }) => {
      try {
        const results = await searchNotes(query, limit ?? 20)
        return toTextPayload(results)
      } catch (error) {
        return formatHandlerError(error)
      }
    },
  )

  server.registerTool(
    'read_note',
    {
      description: 'Read a note markdown body and frontmatter by id.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Note id, e.g. "projets/index"'),
      }),
    },
    async ({ id }) => {
      try {
        const note = await readNoteById(id)
        if (!note) return toolError(`Note not found: ${id}`)
        return toTextPayload(note)
      } catch (error) {
        return formatHandlerError(error)
      }
    },
  )

  server.registerTool(
    'write_note',
    {
      description: 'Create or update a note. Persists via writeToWorkspace (Git commit).',
      inputSchema: z.object({
        id: z.string().min(1).describe('Note id, e.g. "projets/my-note"'),
        content: z.string().describe('Full markdown file content including optional frontmatter'),
      }),
    },
    async ({ id, content }) => {
      try {
        const result = await writeNoteContent(ctx, id, content)
        return toTextPayload({ id, ...result })
      } catch (error) {
        return formatHandlerError(error)
      }
    },
  )

  server.registerTool(
    'list_backlinks',
    {
      description: 'List notes that link to the given note id via wikilinks.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Target note id'),
      }),
    },
    async ({ id }) => {
      try {
        const backlinks = await listBacklinks(id)
        return toTextPayload(backlinks)
      } catch (error) {
        return formatHandlerError(error)
      }
    },
  )

  server.registerTool(
    'get_graph',
    {
      description: 'Return the vault wikilink graph (nodes and edges).',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const graph = await getVaultGraph()
        return toTextPayload(graph)
      } catch (error) {
        return formatHandlerError(error)
      }
    },
  )

  server.registerTool(
    'create_task',
    {
      description: 'Append an unchecked markdown task (- [ ]) to a note. Creates inbox/tasks when missing.',
      inputSchema: z.object({
        text: z.string().min(1).describe('Task description'),
        note_id: z.string().optional().describe('Target note id (default: inbox/tasks)'),
      }),
    },
    async ({ text, note_id: noteId }) => {
      try {
        const result = await createTask(ctx, text, noteId)
        return toTextPayload(result)
      } catch (error) {
        return formatHandlerError(error)
      }
    },
  )

  return server
}
