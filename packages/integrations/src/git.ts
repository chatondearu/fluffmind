import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
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

/**
 * Prepares the server-side working copy for a workspace: clones it if a remote is
 * configured and the path is empty, `git init`s a fresh local repo otherwise, or just
 * fetches/checks out the target branch if the working copy already exists.
 */
export async function ensureWorkingCopy(config: WorkingCopyConfig): Promise<SimpleGit> {
  const { path, remoteUrl, branch } = config

  if (await isEmptyDir(path)) {
    if (remoteUrl) {
      const git = simpleGit()
      await git.clone(remoteUrl, path, ['--branch', branch, '--single-branch'])
      return simpleGit(path)
    }
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
