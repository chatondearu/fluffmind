/**
 * Bind a DaemonMeshTransport per mesh-live workspace when FLUFFMIND_DAEMON_URL is set
 * (ADR-020). Nuxt talks to the daemon over HTTP only; Postgres (or env, auth-off)
 * stays the source of truth and is pushed to the daemon via `PUT /v1/vaults/:id`.
 * shortcut: no retry loop if the daemon is down at boot — the next mesh write re-attaches.
 */
import {
  DaemonMeshTransport,
  putDaemonVault,
  type DaemonClientOptions,
} from '@fluffmind/integrations'
import { bindWorkspaceMeshTransport, publishLocalMeshNote, unbindWorkspaceMeshTransport } from './mesh-apply'
import { resolveWorkspaceConfig, type WorkspaceConfig } from './workspace'

/** Workspace id → in-flight/finished attach. Present ⇔ the daemon knows it as mesh-live. */
const attached = new Map<string, Promise<void>>()

/** Server-side only: the token never reaches browsers. */
function daemonOptions(): DaemonClientOptions | null {
  const url = process.env.FLUFFMIND_DAEMON_URL?.trim()
  if (!url)
    return null
  return { url, token: process.env.FLUFFMIND_DAEMON_TOKEN?.trim() || undefined }
}

export function isDaemonConfigured(): boolean {
  return daemonOptions() !== null
}

function pushConfig(options: DaemonClientOptions, workspaceId: string, config: WorkspaceConfig) {
  return putDaemonVault(options, workspaceId, {
    syncMode: config.syncMode,
    contentRoots: config.contentRoots,
    path: config.path,
  })
}

/** Push the vault config, then bind the transport. Idempotent; retried after a failure. */
export async function ensureWorkspaceMeshPeer(workspaceId: string): Promise<void> {
  const options = daemonOptions()
  if (!options)
    return

  let run = attached.get(workspaceId)
  if (!run) {
    run = (async () => {
      await pushConfig(options, workspaceId, await resolveWorkspaceConfig(workspaceId))
      bindWorkspaceMeshTransport(workspaceId, new DaemonMeshTransport({ ...options, vault: workspaceId }))
    })()
    attached.set(workspaceId, run)
    run.catch(() => attached.delete(workspaceId))
  }
  await run
}

/**
 * Re-push the workspace config after a `syncMode` / `contentRoots` change (or at boot).
 * mesh-live → attach (or refresh); anything else → push so the daemon detaches, drop the binding.
 */
export async function syncWorkspaceDaemonConfig(workspaceId: string): Promise<void> {
  const options = daemonOptions()
  if (!options)
    return

  const config = await resolveWorkspaceConfig(workspaceId)
  if (config.syncMode === 'mesh-live' && !attached.has(workspaceId))
    return ensureWorkspaceMeshPeer(workspaceId)

  if (config.syncMode !== 'mesh-live') {
    attached.delete(workspaceId)
    await unbindWorkspaceMeshTransport(workspaceId)
  }
  else {
    await attached.get(workspaceId)
  }
  await pushConfig(options, workspaceId, config)
}

export interface MeshChange {
  noteId: string
  /** The file is already gone (tombstone). */
  deleted?: boolean
}

/** `writers/<kind>/<id>/…` → `kind:id`. */
function writerFromNoteId(noteId: string): string | undefined {
  const match = /^writers\/([^/]+)\/([^/]+)\//.exec(noteId)
  return match ? `${match[1]}:${match[2]}` : undefined
}

/**
 * Notify the daemon about vault files Nuxt already wrote/removed. Best-effort: failures
 * are logged, never thrown (the local write succeeded). Drafts carry their path owner as
 * writer; canonical paths use `actor` (the session writer). No-op without a daemon.
 */
export async function publishMeshChanges(
  workspaceId: string,
  actor: string,
  changes: MeshChange[],
): Promise<void> {
  if (changes.length === 0)
    return
  try {
    await ensureWorkspaceMeshPeer(workspaceId)
    for (const change of changes) {
      await publishLocalMeshNote(workspaceId, change.noteId, '', {
        writer: writerFromNoteId(change.noteId) ?? actor,
        deleted: change.deleted,
      })
    }
  }
  catch (error) {
    console.error(`[mesh] daemon notify failed for ${workspaceId}:`, error)
  }
}
