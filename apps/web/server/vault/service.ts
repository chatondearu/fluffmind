import { watch } from 'chokidar'
import { buildVaultIndex } from './index'
import type { VaultIndex } from './index'
import { bootstrapWorkspace } from './sync'

function getVaultPath(): string {
  const vaultPath = process.env.VAULT_PATH
  if (!vaultPath) throw new Error('VAULT_PATH environment variable is not set')
  return vaultPath
}

let cachedIndex: Promise<VaultIndex> | null = null
let watcherStarted = false
let rebuildTimer: ReturnType<typeof setTimeout> | null = null

const IGNORED_RE = /(^|[/\\])(\.git|node_modules|\.obsidian|\.vscode|\.foam)([/\\]|$)/
const REBUILD_DEBOUNCE_MS = 400

function shouldWatchFilesystem(): boolean {
  return process.env.VAULT_WATCH !== 'false'
}

/**
 * Returns the current vault index, building it on first access. In dev, also starts a
 * chokidar watcher (once) that invalidates the cache on any markdown file change, so
 * edits made outside the app (e.g. in another editor) show up without a server
 * restart. Nice-to-have for the dogfooding loop — not required for correctness, since
 * every call rebuilds from disk whenever the cache is empty.
 */
export async function getVaultIndex(): Promise<VaultIndex> {
  await bootstrapWorkspace()
  const vaultPath = getVaultPath()
  cachedIndex ??= buildVaultIndex(vaultPath)
  if (shouldWatchFilesystem() && !watcherStarted) {
    watcherStarted = true
    startWatcher(vaultPath)
  }
  return cachedIndex
}

/**
 * Drops the cached index so the next `getVaultIndex()` call rebuilds from disk. Called
 * by `writeToWorkspace` after a successful commit — a full rebuild, not an incremental
 * one, matching `buildVaultIndex`'s existing all-at-once behavior.
 */
export function invalidateVaultIndex(): void {
  cachedIndex = null
}

function scheduleRebuild(vaultPath: string) {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer)
  }
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    cachedIndex = buildVaultIndex(vaultPath)
  }, REBUILD_DEBOUNCE_MS)
}

function startWatcher(vaultPath: string): void {
  const watcher = watch(vaultPath, { ignored: IGNORED_RE, ignoreInitial: true })
  const rebuild = () => {
    scheduleRebuild(vaultPath)
  }
  watcher.on('add', rebuild).on('change', rebuild).on('unlink', rebuild)
}
