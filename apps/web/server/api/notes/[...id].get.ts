import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { getVaultIndex } from '../../vault/service'
import { readNote } from '../../vault/reader'
import { renderNoteHtml } from '../../vault/render'
import { linkifyWikilinks } from '../../vault/wikilink-render'
import { resolveActiveWorkspaceId } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'read')
  }

  const index = await getVaultIndex(workspaceId)
  const note = await readNote(index, id)
  if (!note) throw createError({ statusCode: 404, statusMessage: `Note not found: ${id}` })

  const links = index.links.get(id) ?? []
  const backlinks = (index.backlinks.get(id) ?? [])
    .map((backlinkId) => index.notes.get(backlinkId)!)
    .sort((a, b) => a.title.localeCompare(b.title))

  return {
    note: {
      id: note.id,
      title: note.title,
      frontmatter: note.frontmatter,
      content: note.content,
      html: renderNoteHtml(linkifyWikilinks(note.ast, links)),
    },
    links,
    backlinks,
  }
})
