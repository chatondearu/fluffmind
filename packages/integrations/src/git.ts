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

  if (await isEmptyDir(path)) {
    if (remoteUrl) {
      const git = simpleGit()
      await git.clone(remoteUrl, path, ['--branch', branch, '--single-branch'])
      return simpleGit(path)
    }
    await mkdir(path, { recursive: true })
    const git = simpleGit(path)
    await git.init(['--initial-branch', branch])
    return git
  }

  if (!hasGitDir(path)) {
    const git = simpleGit(path)
    await git.init(['--initial-branch', branch])
    return git
  }

  const git = simpleGit(path)
  if (remoteUrl) {
    await git.fetch('origin', branch)
    const localBranches = await git.branchLocal()
    if (localBranches.all.includes(branch)) {
      await git.checkout(branch)
    } else {
      await git.checkoutBranch(branch, `origin/${branch}`)
    }
  }
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
