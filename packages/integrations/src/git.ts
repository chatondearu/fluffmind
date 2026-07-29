import { existsSync } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'

export interface WorkingCopyConfig {
  /** Absolute path on disk where the server keeps its working copy for this workspace. */
  path: string
  /** Clean Git remote URL. Omit for local-only mode (commits happen, nothing is pushed). */
  remoteUrl?: string
  /** Runtime-only Git remote URL used for authenticated network operations (may embed a token). */
  networkRemoteUrl?: string
  /** Explicit HTTPS access token (GitHub App installation token or PAT). Preferred over embedding in URL. */
  accessToken?: string
  branch: string
}

async function isEmptyDir(path: string): Promise<boolean> {
  if (!existsSync(path)) return true
  return (await readdir(path)).length === 0
}

function hasGitDir(path: string): boolean {
  return existsSync(join(path, '.git'))
}

function createGit(basePath?: string): SimpleGit {
  // Prefer mutating the process env once over simpleGit().env({...process.env}), which
  // reintroduces PAGER/EDITOR and trips simple-git's block-unsafe-operations plugin.
  process.env.GIT_TERMINAL_PROMPT = '0'
  return basePath ? simpleGit(basePath) : simpleGit()
}

function resolveAccessToken(options: { accessToken?: string, networkRemoteUrl?: string }): string | undefined {
  if (options.accessToken)
    return options.accessToken
  if (!options.networkRemoteUrl)
    return undefined

  try {
    const password = new URL(options.networkRemoteUrl).password
    return password ? decodeURIComponent(password) : undefined
  }
  catch {
    return undefined
  }
}

/** GitHub HTTPS auth via http.extraHeader — avoids interactive credential prompts in Docker. */
function gitHttpsAuthArgs(accessToken?: string): string[] {
  if (!accessToken)
    return []

  const basic = Buffer.from(`x-access-token:${accessToken}`, 'utf8').toString('base64')
  return [
    '-c', 'credential.helper=',
    '-c', `http.extraHeader=Authorization: Basic ${basic}`,
  ]
}

export function isGitAuthErrorMessage(message: string): boolean {
  return /could not read Username|Authentication failed|Invalid username or token|terminal prompts disabled|Write access to repository not granted|HTTP Basic: Access denied/i.test(message)
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
 * True when the remote exists but has no refs yet (e.g. GitHub repo created without
 * `auto_init`). `git clone --branch` fails on those; we init locally and push later.
 */
async function remoteHasRefs(remoteUrl: string, accessToken?: string): Promise<boolean> {
  try {
    const refs = await createGit().raw([
      ...gitHttpsAuthArgs(accessToken),
      'ls-remote',
      remoteUrl,
    ])
    return refs.trim().length > 0
  }
  catch {
    return false
  }
}

async function ensureOriginRemote(git: SimpleGit, remoteUrl: string): Promise<void> {
  const remotes = await git.getRemotes(true)
  if (remotes.some(remote => remote.name === 'origin'))
    await git.remote(['set-url', 'origin', remoteUrl])
  else
    await git.addRemote('origin', remoteUrl)
}

/**
 * Prepares the server-side working copy for a workspace:
 * - empty/missing path + remote with commits: clone.
 * - empty/missing path + empty remote (no branches): `git init` + `remote add origin`.
 * - empty/missing path, no remote: `git init` a fresh local repo.
 * - existing files but not yet a repo, no remote: `git init` in place, adopting the
 *   existing files (local-only self-hosting on top of a pre-existing plain folder).
 *   Attaching a remote to a non-empty not-yet-a-repo directory isn't supported here —
 *   merging unrelated histories is out of scope for this spike.
 * - already a repo: fetch/checkout the target branch if a remote is configured.
 */
export async function ensureWorkingCopy(config: WorkingCopyConfig): Promise<SimpleGit> {
  const { path, remoteUrl, networkRemoteUrl, accessToken: explicitToken, branch } = config
  const accessToken = resolveAccessToken({ accessToken: explicitToken, networkRemoteUrl })
  let git: SimpleGit

  if (await isEmptyDir(path)) {
    if (remoteUrl) {
      const fetchUrl = remoteUrl
      if (await remoteHasRefs(fetchUrl, accessToken)) {
        await createGit().raw([
          ...gitHttpsAuthArgs(accessToken),
          'clone',
          '--branch',
          branch,
          '--single-branch',
          fetchUrl,
          path,
        ])
        git = createGit(path)
        await git.remote(['set-url', 'origin', remoteUrl])
      }
      else {
        await mkdir(path, { recursive: true })
        git = createGit(path)
        await git.init(['--initial-branch', branch])
        await git.addRemote('origin', remoteUrl)
      }
    }
    else {
      await mkdir(path, { recursive: true })
      git = createGit(path)
      await git.init(['--initial-branch', branch])
    }
  }
  else if (!hasGitDir(path)) {
    git = createGit(path)
    await git.init(['--initial-branch', branch])
  }
  else {
    git = createGit(path)
    if (remoteUrl) {
      await ensureOriginRemote(git, remoteUrl)
      if (await remoteHasRefs(remoteUrl, accessToken)) {
        await fetchRemote(git, branch, { accessToken })
        const localBranches = await git.branchLocal()
        if (localBranches.all.includes(branch)) {
          await git.checkout(branch)
        }
        else {
          await git.checkoutBranch(branch, `origin/${branch}`)
        }
      }
    }
  }

  await ensureCommitIdentity(git)
  return git
}

async function fetchRemote(
  git: SimpleGit,
  branch: string,
  options: { accessToken?: string, networkRemoteUrl?: string } = {},
): Promise<void> {
  const accessToken = resolveAccessToken(options)
  await git.raw([...gitHttpsAuthArgs(accessToken), 'fetch', 'origin', branch])
}

async function pushRemote(
  git: SimpleGit,
  branch: string,
  options: { accessToken?: string, networkRemoteUrl?: string } = {},
): Promise<void> {
  const accessToken = resolveAccessToken(options)
  // -u sets upstream on first push to an empty GitHub repo (no auto_init).
  await git.raw([...gitHttpsAuthArgs(accessToken), 'push', '-u', 'origin', branch])
}

async function pullRemote(
  git: SimpleGit,
  branch: string,
  options: { accessToken?: string, networkRemoteUrl?: string } = {},
): Promise<void> {
  const accessToken = resolveAccessToken(options)
  await git.raw([...gitHttpsAuthArgs(accessToken), 'pull', 'origin', branch])
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

/** Thrown when git cannot authenticate to the remote (missing/invalid token). */
export class GitAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitAuthError'
  }
}

export interface CommitPushOptions {
  branch: string
  message: string
  /** Whether this working copy has a remote configured at all — skips push entirely
   * for local-only self-hosting (no GitHub). */
  remoteConfigured: boolean
  /** Runtime-only Git remote URL used for authenticated push and rebase fetches. */
  networkRemoteUrl?: string
  /** Explicit HTTPS access token (preferred). */
  accessToken?: string
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
  options: { branch: string, remoteConfigured: boolean },
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
  }
  catch {
    const status = await git.status()
    ahead = status.ahead ?? 0
    behind = status.behind ?? 0
  }

  return {
    remoteConfigured: true,
    branch,
    ahead,
    behind,
    diverged: ahead > 0,
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
  options: { branch: string, remoteConfigured: boolean, networkRemoteUrl?: string, accessToken?: string },
): Promise<PullFromRemoteResult> {
  const { branch, remoteConfigured, networkRemoteUrl, accessToken } = options
  if (!remoteConfigured) {
    return { updated: false, behindBefore: 0 }
  }

  await fetchRemote(git, branch, { networkRemoteUrl, accessToken })
  const before = await getSyncStatus(git, { branch, remoteConfigured })
  if (before.behind === 0) {
    return { updated: false, behindBefore: 0 }
  }

  await pullRemote(git, branch, { networkRemoteUrl, accessToken })
  return { updated: true, behindBefore: before.behind }
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rethrowIfGitAuthError(error: unknown): void {
  const message = asErrorMessage(error)
  if (isGitAuthErrorMessage(message))
    throw new GitAuthError(message)
}

function isMissingRemoteRefError(error: unknown): boolean {
  return /couldn'?t find remote ref|fatal: couldn'?t find remote ref|no such ref|unknown revision/i.test(asErrorMessage(error))
}

/**
 * Commits whatever is currently in the working copy, then pushes. On a rejected push
 * (remote has diverged), fetches and rebases on top of the remote branch and retries
 * the push once. A real rebase conflict aborts cleanly and throws GitConflictError —
 * the commit made here is never lost, only left unpushed.
 */
export async function commitAndPush(git: SimpleGit, options: CommitPushOptions): Promise<CommitPushResult> {
  const { branch, message, remoteConfigured, networkRemoteUrl, accessToken } = options
  const auth = { networkRemoteUrl, accessToken }

  await git.add(['-A'])
  const status = await git.status()
  const committed = status.files.length > 0
  if (committed) await git.commit(message)

  if (!remoteConfigured) return { committed, pushed: false }

  try {
    await pushRemote(git, branch, auth)
    return { committed, pushed: true }
  }
  catch (pushError) {
    rethrowIfGitAuthError(pushError)

    try {
      await fetchRemote(git, branch, auth)
    }
    catch (fetchError) {
      rethrowIfGitAuthError(fetchError)
      // Empty remote (no branches yet): first push should have created it. Surface the
      // original push error instead of a confusing "missing remote ref" from fetch.
      if (isMissingRemoteRefError(fetchError))
        throw pushError
      throw fetchError
    }

    try {
      await git.rebase([`origin/${branch}`])
    }
    catch {
      await git.rebase(['--abort']).catch(() => {})
      throw new GitConflictError(
        `Rebase conflict syncing branch "${branch}" — local commit is intact but not pushed.`,
      )
    }

    try {
      await pushRemote(git, branch, auth)
      return { committed, pushed: true }
    }
    catch (retryError) {
      rethrowIfGitAuthError(retryError)
      throw retryError
    }
  }
}
