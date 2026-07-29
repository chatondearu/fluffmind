import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { afterEach, describe, expect, it } from 'vitest'
import { commitAndPush, ensureWorkingCopy } from './git.ts'

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
