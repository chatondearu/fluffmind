import { watch } from 'chokidar'

import { buildVaultIndex } from './index'
import type { VaultIndex } from './index'
import { bootstrapWorkspace } from './sync'
import { resolveWorkspaceConfig } from './workspace'

const indexCache = new Map<string, Promise<VaultIndex>>()
const watchersStarted = new Set<string>()
const rebuildTimers = new Map<string, ReturnType<typeof setTimeout>>()

const IGNORED_RE = /(^|[/\\])(\.git|node_modules|\.obsidian|\.vscode|\.foam)([/\\]|$)/
const REBUILD_DEBOUNCE_MS = 400

function shouldWatchFilesystem(): boolean {
  return process.env.VAULT_WATCH !== 'false'
}

/**
 * Returns the vault index for a workspace, building it on first access.
 * When auth is enabled, pass the active organization id from the session.
 */
export async function getVaultIndex(workspaceId = 'default'): Promise<VaultIndex> {
  await bootstrapWorkspace(workspaceId)
  const config = await resolveWorkspaceConfig(workspaceId)

  if (!indexCache.has(workspaceId)) {
    indexCache.set(workspaceId, buildVaultIndex(config.path))
  }

  if (shouldWatchFilesystem() && !watchersStarted.has(config.path)) {
    watchersStarted.add(config.path)
    startWatcher(config.path, workspaceId)
  }

  return indexCache.get(workspaceId)!
}

/** Drops cached index(es). Pass workspaceId to invalidate one workspace only. */
export function invalidateVaultIndex(workspaceId?: string): void {
  if (workspaceId) {
    indexCache.delete(workspaceId)
    return
  }
  indexCache.clear()
}

function scheduleRebuild(vaultPath: string, workspaceId: string) {
  const timerKey = `${workspaceId}:${vaultPath}`
  const existing = rebuildTimers.get(timerKey)
  if (existing) clearTimeout(existing)

  rebuildTimers.set(
    timerKey,
    setTimeout(() => {
      rebuildTimers.delete(timerKey)
      indexCache.set(workspaceId, buildVaultIndex(vaultPath))
    }, REBUILD_DEBOUNCE_MS),
  )
}

function startWatcher(vaultPath: string, workspaceId: string): void {
  const watcher = watch(vaultPath, { ignored: IGNORED_RE, ignoreInitial: true })
  const rebuild = () => {
    scheduleRebuild(vaultPath, workspaceId)
  }
  watcher.on('add', rebuild).on('change', rebuild).on('unlink', rebuild)
}
