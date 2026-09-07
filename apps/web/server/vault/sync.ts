import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { commitAndPush, ensureWorkingCopy, getSyncStatus, type SyncStatus } from '@fluffmind/integrations'

import { isAuthEnabled } from '../utils/auth'
import { vaultHasMarkdownNotes } from './index'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from './workspace'

const WELCOME_NOTE = `# Welcome to Fluffmind

Your vault is ready. Create notes from the home page or edit this file.

## Git sync (optional)

To back up notes on GitHub, set \`GIT_REMOTE_URL\` in your deployment environment and redeploy.
`

const bootstrapPromises = new Map<string, Promise<SyncStatus | null>>()

async function seedWelcomeNoteIfEmpty(
  workspaceId: string,
  vaultPath: string,
  branch: string,
  remoteConfigured: boolean,
  contentRoots: string[],
): Promise<void> {
  if (await vaultHasMarkdownNotes(vaultPath, contentRoots))
    return

  const welcomeRel = contentRoots.length > 0
    ? join(contentRoots[0]!, 'welcome.md')
    : 'welcome.md'
  const welcomePath = join(vaultPath, welcomeRel)
  await mkdir(dirname(welcomePath), { recursive: true })
  await writeFile(welcomePath, WELCOME_NOTE, 'utf-8')

  const config = await resolveWorkspaceConfig(workspaceId)
  const network = await resolveWorkspaceGitNetwork(workspaceId)
  const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
  await commitAndPush(git, {
    branch,
    message: 'Seed welcome note',
    remoteConfigured,
    accessToken: network.accessToken,
  })
  invalidateVaultIndex(workspaceId)
}

function logSyncWarnings(status: SyncStatus, branch: string): void {
  if (!status.remoteConfigured) return
  if (status.ahead > 0) {
    console.warn(
      `[vault] Workspace is ${status.ahead} commit(s) ahead of origin/${branch} — unpushed local commits detected.`,
    )
  }
  if (status.behind > 0) {
    console.warn(
      `[vault] Workspace is ${status.behind} commit(s) behind origin/${branch}.`,
    )
  }
}

/**
 * Ensures the Git working copy exists for a workspace before indexing.
 * Idempotent — the resolved promise is cached per workspace id. A *failed* bootstrap is
 * evicted from the cache so the next call retries instead of replaying the rejection
 * forever (a transient clone/network failure must not brick the workspace).
 */
export function bootstrapWorkspace(workspaceId = 'default'): Promise<SyncStatus | null> {
  if (!isAuthEnabled() && workspaceId !== 'default') {
    return bootstrapWorkspace('default')
  }

  const existing = bootstrapPromises.get(workspaceId)
  if (existing) return existing

  const promise = (async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    const network = await resolveWorkspaceGitNetwork(workspaceId)
    const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
    await seedWelcomeNoteIfEmpty(
      workspaceId,
      config.path,
      config.branch,
      Boolean(config.remoteUrl),
      config.contentRoots,
    )
    const status = await getSyncStatus(git, {
      branch: config.branch,
      remoteConfigured: Boolean(config.remoteUrl),
    })
    logSyncWarnings(status, config.branch)
    return status
  })()

  // Evict on failure so a later call can retry from scratch.
  promise.catch(() => {
    if (bootstrapPromises.get(workspaceId) === promise) {
      bootstrapPromises.delete(workspaceId)
    }
  })

  bootstrapPromises.set(workspaceId, promise)
  return promise
}

/**
 * Drop the cached bootstrap for a workspace so the next {@link bootstrapWorkspace} call
 * re-clones/re-adopts the working copy. Call after the workspace's Git remote changes
 * (link/unlink/relink) or after a hard reset that rewrites the working copy.
 */
export function invalidateBootstrap(workspaceId = 'default'): void {
  bootstrapPromises.delete(workspaceId)
}

/** Fresh sync status for API visibility — always re-reads from git. */
export async function getWorkspaceSyncStatus(workspaceId = 'default'): Promise<SyncStatus | null> {
  try {
    await bootstrapWorkspace(workspaceId)
    const config = await resolveWorkspaceConfig(workspaceId)
    const network = await resolveWorkspaceGitNetwork(workspaceId)
    const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
    return getSyncStatus(git, {
      branch: config.branch,
      remoteConfigured: Boolean(config.remoteUrl),
    })
  } catch {
    return null
  }
}
