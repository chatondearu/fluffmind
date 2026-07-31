import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { afterEach, describe, expect, it } from 'vitest'
import { commitAndPush, ensureWorkingCopy, GitConflictError, pullFromRemote, resetHardToRemote } from './git.ts'

describe('ensureWorkingCopy with empty remote', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  it('inits locally when the remote has no branches (no auto_init README)', async () => {
    const bare = await tempDir('fluff-bare-')
    const work = await tempDir('fluff-work-')
    await simpleGit().init(['--bare', bare])

    const git = await ensureWorkingCopy({
      path: work,
      remoteUrl: bare,
      branch: 'main',
    })

    expect(await git.checkIsRepo()).toBe(true)
    const remotes = await git.getRemotes(true)
    expect(remotes.some(remote => remote.name === 'origin')).toBe(true)

    await writeFile(join(work, 'welcome.md'), '# hello\n', 'utf-8')
    const result = await commitAndPush(git, {
      branch: 'main',
      message: 'Seed welcome note',
      remoteConfigured: true,
    })

    expect(result).toEqual({ committed: true, pushed: true })
  })

  it('pushes existing local history onto an empty remote without rebase conflict', async () => {
    const bare = await tempDir('fluff-bare-')
    const work = await tempDir('fluff-work-')
    await simpleGit().init(['--bare', bare])

    // Simulate vault bootstrapped before GitHub link (local welcome commit, no remote).
    const local = simpleGit(work)
    await local.init(['--initial-branch', 'main'])
    await local.addConfig('user.name', 'Fluffmind', false, 'local')
    await local.addConfig('user.email', 'fluffmind@localhost', false, 'local')
    await writeFile(join(work, 'welcome.md'), '# hello\n', 'utf-8')
    await local.add(['-A'])
    await local.commit('Seed welcome note')

    const git = await ensureWorkingCopy({
      path: work,
      remoteUrl: bare,
      branch: 'main',
    })

    await writeFile(join(work, 'a.md'), '# a\n', 'utf-8')
    const result = await commitAndPush(git, {
      branch: 'main',
      message: 'Add note',
      remoteConfigured: true,
    })

    expect(result).toEqual({ committed: true, pushed: true })
  })
})

describe('pullFromRemote with divergent branches', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  async function initIdentity(cwd: string) {
    const git = simpleGit(cwd)
    await git.addConfig('user.name', 'Fluffmind', false, 'local')
    await git.addConfig('user.email', 'fluffmind@localhost', false, 'local')
    return git
  }

  it('rebases local commits onto origin when histories diverged', async () => {
    const bare = await tempDir('fluff-pull-bare-')
    const remoteWork = await tempDir('fluff-pull-remote-')
    const localWork = await tempDir('fluff-pull-local-')
    await simpleGit().init(['--bare', bare])

    const seed = simpleGit(remoteWork)
    await seed.clone(bare, remoteWork)
    await initIdentity(remoteWork)
    await writeFile(join(remoteWork, 'shared.md'), '# base\n', 'utf-8')
    await seed.add(['-A'])
    await seed.commit('Base')
    await seed.push('origin', 'main')

    await simpleGit().clone(bare, localWork)
    await initIdentity(localWork)
    await writeFile(join(localWork, 'local.md'), '# local\n', 'utf-8')
    const local = simpleGit(localWork)
    await local.add(['-A'])
    await local.commit('Local only')

    await writeFile(join(remoteWork, 'remote.md'), '# remote\n', 'utf-8')
    await seed.add(['-A'])
    await seed.commit('Remote only')
    await seed.push('origin', 'main')

    const git = await ensureWorkingCopy({
      path: localWork,
      remoteUrl: bare,
      branch: 'main',
    })

    const result = await pullFromRemote(git, {
      branch: 'main',
      remoteConfigured: true,
    })

    expect(result.updated).toBe(true)
    expect(result.behindBefore).toBeGreaterThan(0)
    const status = await git.status()
    expect(status.behind).toBe(0)
  })

  it('throws GitConflictError when pull rebase hits a content conflict', async () => {
    const bare = await tempDir('fluff-pull-conflict-bare-')
    const remoteWork = await tempDir('fluff-pull-conflict-remote-')
    const localWork = await tempDir('fluff-pull-conflict-local-')
    await simpleGit().init(['--bare', bare])

    const seed = simpleGit(remoteWork)
    await seed.clone(bare, remoteWork)
    await initIdentity(remoteWork)
    await writeFile(join(remoteWork, 'note.md'), '# base\n', 'utf-8')
    await seed.add(['-A'])
    await seed.commit('Base')
    await seed.push('origin', 'main')

    await simpleGit().clone(bare, localWork)
    await initIdentity(localWork)
    await writeFile(join(localWork, 'note.md'), '# local edit\n', 'utf-8')
    const local = simpleGit(localWork)
    await local.add(['-A'])
    await local.commit('Local edit')

    await writeFile(join(remoteWork, 'note.md'), '# remote edit\n', 'utf-8')
    await seed.add(['-A'])
    await seed.commit('Remote edit')
    await seed.push('origin', 'main')

    const git = await ensureWorkingCopy({
      path: localWork,
      remoteUrl: bare,
      branch: 'main',
    })

    await expect(pullFromRemote(git, {
      branch: 'main',
      remoteConfigured: true,
    })).rejects.toBeInstanceOf(GitConflictError)
  })
})

describe('resetHardToRemote', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  async function initIdentity(cwd: string) {
    const git = simpleGit(cwd)
    await git.addConfig('user.name', 'Fluffmind', false, 'local')
    await git.addConfig('user.email', 'fluffmind@localhost', false, 'local')
    return git
  }

  it('resetHardToRemote discards local commits and matches origin', async () => {
    const bare = await tempDir('fluff-reset-bare-')
    const remoteWork = await tempDir('fluff-reset-remote-')
    const localWork = await tempDir('fluff-reset-local-')
    await simpleGit().init(['--bare', bare])

    const seedGit = await ensureWorkingCopy({ path: remoteWork, remoteUrl: bare, branch: 'main' })
    await writeFile(join(remoteWork, 'remote.md'), '# remote\n', 'utf-8')
    await commitAndPush(seedGit, { branch: 'main', message: 'Remote', remoteConfigured: true })

    await simpleGit().clone(bare, localWork)
    await initIdentity(localWork)
    await writeFile(join(localWork, 'local-only.md'), '# keep?\n', 'utf-8')
    const local = simpleGit(localWork)
    await local.add(['-A'])
    await local.commit('Local only')

    const git = await ensureWorkingCopy({ path: localWork, remoteUrl: bare, branch: 'main' })
    await resetHardToRemote(git, { branch: 'main' })

    const files = await readdir(localWork)
    expect(files).toContain('remote.md')
    expect(files).not.toContain('local-only.md')
  })
})