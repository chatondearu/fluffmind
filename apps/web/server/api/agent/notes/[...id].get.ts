import { listBacklinks, readNoteById } from '../../../mcp/handlers'
import { requireAgentBearer } from '../../../utils/agent-auth'

const BACKLINKS_SUFFIX = '/backlinks'

// Nitro/h3's radix3 router resolves `notes/[...id]/backlinks.get.ts` as a
// sibling path segment under the `notes/[...id]` catch-all, so the catch-all
// always wins and the dedicated backlinks route is never reached (e.g.
// `/api/agent/notes/alpha/backlinks` resolves here with id `alpha/backlinks`).
// We detect the suffix ourselves and dispatch to listBacklinks instead of
// relying on a separate route file.
export default defineEventHandler(async (event) => {
  const rawId = getRouterParam(event, 'id')
  if (!rawId) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const { workspaceId } = await requireAgentBearer(event)

  if (rawId.endsWith(BACKLINKS_SUFFIX) && rawId.length > BACKLINKS_SUFFIX.length) {
    const noteId = rawId.slice(0, -BACKLINKS_SUFFIX.length)
    return listBacklinks(noteId, workspaceId)
  }

  const note = await readNoteById(rawId, workspaceId)
  if (!note) throw createError({ statusCode: 404, statusMessage: `Note not found: ${rawId}` })
  return note
})
