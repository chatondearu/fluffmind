import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import {
  WorkspaceLockTimeoutError,
  __testOnly,
  advisoryLockKeys,
  resolveFlockPath,
  withWorkspaceLock,
} from './lock'
import { VaultReadOnlyError } from './readonly'

describe('advisoryLockKeys', () => {
  it('returns a stable int32 pair for the same workspace id', () => {
    expect(advisoryLockKeys('org_abc')).toEqual(advisoryLockKeys('org_abc'))
  })

  it('returns different keys for different workspace ids', () => {
    expect(advisoryLockKeys('a')).not.toEqual(advisoryLockKeys('b'))
  })

  it('fits signed 32-bit integers', () => {
    const [k1, k2] = advisoryLockKeys('workspace/with/slashes')
    for (const k of [k1, k2]) {
      expect(Number.isInteger(k)).toBe(true)
      expect(k).toBeGreaterThanOrEqual(-0x80000000)
      expect(k).toBeLessThanOrEqual(0x7fffffff)
    }
  })
})

describe('resolveFlockPath', () => {
  afterEach(() => {
    delete process.env.WORKSPACES_ROOT
    delete process.env.VAULT_PATH
  })

  it('uses WORKSPACES_ROOT/.fluffmind-locks when set', () => {
    process.env.WORKSPACES_ROOT = '/data/workspaces'
    expect(resolveFlockPath('org_1')).toBe(resolve('/data/workspaces/.fluffmind-locks/org_1.lock'))
  })

  it('falls back to a sibling of VAULT_PATH when WORKSPACES_ROOT is unset', () => {
    process.env.VAULT_PATH = '/home/me/vault'
    const hash = createHash('sha256').update(resolve('/home/me/vault')).digest('hex').slice(0, 16)
    expect(resolveFlockPath('default')).toBe(resolve(`/home/me/.fluffmind-locks/${hash}.lock`))
  })
})

describe('withWorkspaceLock (local chain + flock)', () => {
  afterEach(() => {
    delete process.env.DATABASE_URL
    delete process.env.LOCK_WAIT_MS
    delete process.env.WORKSPACES_ROOT
    delete process.env.VAULT_READONLY
    __testOnly.resetLocalChains()
  })

  it('rejects before locking when VAULT_READONLY=true', async () => {
    process.env.VAULT_READONLY = 'true'
    process.env.WORKSPACES_ROOT = await mkdtemp(join(tmpdir(), 'fluffmind-lock-ro-'))
    await expect(withWorkspaceLock('ws-ro', async () => 'ok')).rejects.toBeInstanceOf(VaultReadOnlyError)
  })

  it('serializes concurrent critical sections for the same workspace', async () => {
    process.env.WORKSPACES_ROOT = await mkdtemp(join(tmpdir(), 'fluffmind-lock-'))
    const order: number[] = []

    await Promise.all([
      withWorkspaceLock('ws-a', async () => {
        order.push(1)
        await delay(40)
        order.push(2)
      }),
      withWorkspaceLock('ws-a', async () => {
        order.push(3)
        await delay(10)
        order.push(4)
      }),
    ])

    expect(order).toEqual([1, 2, 3, 4])
  })

  it('does not poison the chain when a critical section fails', async () => {
    process.env.WORKSPACES_ROOT = await mkdtemp(join(tmpdir(), 'fluffmind-lock-'))

    await expect(
      withWorkspaceLock('ws-b', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    await expect(
      withWorkspaceLock('ws-b', async () => 'ok'),
    ).resolves.toBe('ok')
  })

  it('times out when the flock cannot be acquired', async () => {
    process.env.WORKSPACES_ROOT = await mkdtemp(join(tmpdir(), 'fluffmind-lock-'))
    process.env.LOCK_WAIT_MS = '80'

    const lockPath = resolveFlockPath('ws-timeout')
    await mkdir(dirname(lockPath), { recursive: true })
    await writeFile(lockPath, '', 'utf-8')

    const release = await __testOnly.acquireFlockForTests(lockPath)

    try {
      await expect(
        withWorkspaceLock('ws-timeout', async () => 'never'),
      ).rejects.toBeInstanceOf(WorkspaceLockTimeoutError)
    }
    finally {
      await release()
    }
  })

  it('allows different workspaces to run in parallel', async () => {
    process.env.WORKSPACES_ROOT = await mkdtemp(join(tmpdir(), 'fluffmind-lock-'))
    let overlapping = false
    let aInside = false

    await Promise.all([
      withWorkspaceLock('ws-x', async () => {
        aInside = true
        await delay(50)
        aInside = false
      }),
      withWorkspaceLock('ws-y', async () => {
        await delay(10)
        if (aInside) overlapping = true
      }),
    ])

    expect(overlapping).toBe(true)
  })
})
