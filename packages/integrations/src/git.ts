import { existsSync } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'

export interface WorkingCopyConfig {
  /** Absolute path on disk where the server keeps its working copy for this workspace. */
  path: string
  /** Git remote URL. Omit for local-only mode (commits happen, nothing is pushed). */
  remoteUrl?: string
  branch: string
}

async function isEmptyDir(path: string): Promise<boolean> {
  if (!existsSync(path)) return true
  return (await readdir(path)).length === 0
}

function hasGitDir(path: string): boolean {
  return existsSync(join(path, '.git'))
}

/**
 * Sets a repo-local commit identity, idempotently. The server commits on behalf of
 * users — it can't rely on a human's global `git config` existing in whatever
 * environment it runs in (bare Docker image, CI, ...), so every working copy gets one
 * set explicitly rather than failing on "please tell me who you are".
 */
async function ensureCommitIdentity(git: SimpleGit): Promise<void> {
  await git.addConfig('user.name', 'Fluffmind', false, 'local')
  await git.addConfig('user.email', 'fluffmind@localhost', false, 'local')
}

/**
 * Prepares the server-side working copy for a workspace:
 * - empty/missing path + remote configured: clone.
 * - empty/missing path, no remote: `git init` a fresh local repo.
 * - existing files but not yet a repo, no remote: `git init` in place, adopting the
 *   existing files (local-only self-hosting on top of a pre-existing plain folder).
 *   Attaching a remote to a non-empty not-yet-a-repo directory isn't supported here —
 *   merging unrelated histories is out of scope for this spike.
 * - already a repo: fetch/checkout the target branch if a remote is configured.
 */
export async function ensureWorkingCopy(config: WorkingCopyConfig): Promise<SimpleGit> {
  const { path, remoteUrl, branch } = config
  let git: SimpleGit

  if (await isEmptyDir(path)) {
    if (remoteUrl) {
      await simpleGit().clone(remoteUrl, path, ['--branch', branch, '--single-branch'])
      git = simpleGit(path)
    } else {
      await mkdir(path, { recursive: true })
      git = simpleGit(path)
      await git.init(['--initial-branch', branch])
    }
  } else if (!hasGitDir(path)) {
    git = simpleGit(path)
    await git.init(['--initial-branch', branch])
  } else {
    git = simpleGit(path)
    if (remoteUrl) {
      await git.fetch('origin', branch)
      const localBranches = await git.branchLocal()
      if (localBranches.all.includes(branch)) {
        await git.checkout(branch)
      } else {
        await git.checkoutBranch(branch, `origin/${branch}`)
      }
    }
  }

  await ensureCommitIdentity(git)
  return git
}

/** Thrown when a rebase-on-push-rejected hits a real conflict. The local commit is
 * always left intact (rebase is aborted, not left half-applied) — this only means the
 * workspace is out of sync with the remote, never that a write was lost. */
export class GitConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitConflictError'
  }
}

export interface CommitPushOptions {
  branch: string
  message: string
  /** Whether this working copy has a remote configured at all — skips push entirely
   * for local-only self-hosting (no GitHub). */
  remoteConfigured: boolean
}

export interface CommitPushResult {
  /** False if the working tree had no changes to commit. */
  committed: boolean
  pushed: boolean
}

export interface SyncStatus {
  remoteConfigured: boolean
  branch: string
  /** Local commits not on the remote tracking branch. */
  ahead: number
  /** Remote commits not merged locally. */
  behind: number
  /** True when there are unpushed local commits (e.g. after a rejected push / conflict abort). */
  diverged: boolean
}

/**
 * Compares the current branch to its remote tracking ref. Local-only workspaces
 * (no remote configured) always report zero ahead/behind.
 */
export async function getSyncStatus(
  git: SimpleGit,
  options: { branch: string, remoteConfigured: boolean }
): Promise<SyncStatus> {
  const { branch, remoteConfigured } = options

  if (!remoteConfigured) {
    return { remoteConfigured: false, branch, ahead: 0, behind: 0, diverged: false }
  }

  let ahead = 0
  let behind = 0

  try {
    const output = await git.raw(['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`])
    const [aheadStr, behindStr] = output.trim().split(/\s+/)
    ahead = Number(aheadStr) || 0
    behind = Number(behindStr) || 0
  } catch {
    const status = await git.status()
    ahead = status.ahead ?? 0
    behind = status.behind ?? 0
  }

  return {
    remoteConfigured: true,
    branch,
    ahead,
    behind,
    diverged: ahead > 0
  }
}

export interface PullFromRemoteResult {
  updated: boolean
  behindBefore: number
}

/**
 * Fetches and fast-forwards the local branch to match origin when the remote is ahead.
 * No-op when already up to date or when no remote is configured.
 */
export async function pullFromRemote(
  git: SimpleGit,
  options: { branch: string, remoteConfigured: boolean },
): Promise<PullFromRemoteResult> {
  const { branch, remoteConfigured } = options
  if (!remoteConfigured) {
    return { updated: false, behindBefore: 0 }
  }

  await git.fetch('origin', branch)
  const before = await getSyncStatus(git, { branch, remoteConfigured })
  if (before.behind === 0) {
    return { updated: false, behindBefore: 0 }
  }

  await git.pull('origin', branch)
  return { updated: true, behindBefore: before.behind }
}

/**
 * Commits whatever is currently in the working copy, then pushes. On a rejected push
 * (remote has diverged), fetches and rebases on top of the remote branch and retries
 * the push once. A real rebase conflict aborts cleanly and throws GitConflictError —
 * the commit made here is never lost, only left unpushed.
 */
export async function commitAndPush(git: SimpleGit, options: CommitPushOptions): Promise<CommitPushResult> {
  const { branch, message, remoteConfigured } = options

  await git.add(['-A'])
  const status = await git.status()
  const committed = status.files.length > 0
  if (committed) await git.commit(message)

  if (!remoteConfigured) return { committed, pushed: false }

  try {
    await git.push('origin', branch)
    return { committed, pushed: true }
  } catch {
    await git.fetch('origin', branch)
    try {
      await git.rebase([`origin/${branch}`])
    } catch {
      await git.rebase(['--abort']).catch(() => {})
      throw new GitConflictError(
        `Rebase conflict syncing branch "${branch}" — local commit is intact but not pushed.`
      )
    }
    await git.push('origin', branch)
    return { committed, pushed: true }
  }
}
