import { readNoteById } from '../../../mcp/handlers'
import { requireAgentBearer } from '../../../utils/agent-auth'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const { workspaceId } = await requireAgentBearer(event)

  const note = await readNoteById(id, workspaceId)
  if (!note) throw createError({ statusCode: 404, statusMessage: `Note not found: ${id}` })
  return note
})
