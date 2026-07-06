import { watch } from 'chokidar'
import { buildVaultIndex } from './index'
import type { VaultIndex } from './index'

function getVaultPath(): string {
  const vaultPath = process.env.VAULT_PATH
  if (!vaultPath) throw new Error('VAULT_PATH environment variable is not set')
  return vaultPath
}

let cachedIndex: Promise<VaultIndex> | null = null
let watcherStarted = false

const IGNORED_RE = /(^|[/\\])(\.git|node_modules|\.obsidian|\.vscode|\.foam)([/\\]|$)/

/**
 * Returns the current vault index, building it on first access. In dev, also starts a
 * chokidar watcher (once) that invalidates the cache on any markdown file change, so
 * edits made outside the app (e.g. in another editor) show up without a server
 * restart. Nice-to-have for the dogfooding loop — not required for correctness, since
 * every call rebuilds from disk whenever the cache is empty.
 */
export function getVaultIndex(): Promise<VaultIndex> {
  const vaultPath = getVaultPath()
  cachedIndex ??= buildVaultIndex(vaultPath)
  if (import.meta.dev && !watcherStarted) {
    watcherStarted = true
    startWatcher(vaultPath)
  }
  return cachedIndex
}

function startWatcher(vaultPath: string): void {
  const watcher = watch(vaultPath, { ignored: IGNORED_RE, ignoreInitial: true })
  const rebuild = () => {
    cachedIndex = buildVaultIndex(vaultPath)
  }
  watcher.on('add', rebuild).on('change', rebuild).on('unlink', rebuild)
}
