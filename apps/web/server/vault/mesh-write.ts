import type { H3Event } from 'h3'
import { resolveWorkspaceConfig } from './workspace'
import { noteIdForMeshWriter, resolveSessionWriter } from './hosted-writer'
import type { WriterIdentity } from './writer-prefix'
import type { WriteNoteOptions } from './write'

export interface MeshWritePlan {
  noteId: string
  options: WriteNoteOptions
  writer: WriterIdentity | undefined
}

/**
 * When the workspace is mesh-live, resolve the session writer and rewrite the
 * note id under `writers/<kind>/<id>/` as needed. git-live leaves id/options alone.
 */
export async function planMeshNoteWrite(
  event: H3Event,
  workspaceId: string,
  noteId: string,
  baseOptions: WriteNoteOptions = {},
): Promise<MeshWritePlan> {
  const config = await resolveWorkspaceConfig(workspaceId)
  if (config.syncMode !== 'mesh-live') {
    return { noteId, options: baseOptions, writer: undefined }
  }

  const writer = await resolveSessionWriter(event)
  const resolvedId = noteIdForMeshWriter(noteId, writer)
  return {
    noteId: resolvedId,
    writer,
    options: { ...baseOptions, writer },
  }
}
