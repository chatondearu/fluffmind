import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import lockfile from 'proper-lockfile'

import { assertVaultWritable } from './readonly'

export class WorkspaceLockTimeoutError extends Error {
  constructor(workspaceId: string, waitMs: number) {
    super(`Timed out after ${waitMs}ms waiting for workspace lock "${workspaceId}"`)
    this.name = 'WorkspaceLockTimeoutError'
  }
}

const localChains = new Map<string, Promise<unknown>>()

/** Stable signed int32 pair for `pg_try_advisory_lock(key1, key2)`. */
export function advisoryLockKeys(workspaceId: string): [number, number] {
  const digest = createHash('sha256').update(workspaceId).digest()
  return [digest.readInt32BE(0), digest.readInt32BE(4)]
}

export function getLockWaitMs(): number {
  const raw = process.env.LOCK_WAIT_MS
  if (!raw) return 45_000
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45_000
}

function sanitizeLockSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'workspace'
}

/**
 * Lockfile path outside each workspace Git work tree when possible.
 * @see ADR-007
 */
export function resolveFlockPath(workspaceId: string): string {
  const workspacesRoot = process.env.WORKSPACES_ROOT?.trim()
  if (workspacesRoot) {
    return resolve(workspacesRoot, '.fluffmind-locks', `${sanitizeLockSegment(workspaceId)}.lock`)
  }

  const vaultPath = process.env.VAULT_PATH?.trim()
  if (vaultPath) {
    const hash = createHash('sha256').update(resolve(vaultPath)).digest('hex').slice(0, 16)
    return resolve(dirname(resolve(vaultPath)), '.fluffmind-locks', `${hash}.lock`)
  }

  return resolve(process.cwd(), '.fluffmind-locks', `${sanitizeLockSegment(workspaceId)}.lock`)
}

function usePostgresLock(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

async function withLocalChain<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  const previous = localChains.get(workspaceId) ?? Promise.resolve()
  const settled = previous.then(run, run)
  localChains.set(
    workspaceId,
    settled.then(
      () => undefined,
      () => undefined,
    ),
  )
  return settled
}

async function acquireFlock(lockPath: string, waitMs: number): Promise<(() => Promise<void>) | null> {
  await mkdir(dirname(lockPath), { recursive: true })
  await writeFile(lockPath, '', { flag: 'a' })

  const retries = Math.max(1, Math.ceil(waitMs / 50))
  try {
    return await lockfile.lock(lockPath, {
      stale: 120_000,
      retries: {
        retries,
        factor: 1,
        minTimeout: 50,
        maxTimeout: 50,
        randomize: false,
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/retries|ELOCKED|lock/i.test(message)) {
      return null
    }
    throw error
  }
}

async function withFlockLock<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  const waitMs = getLockWaitMs()
  const lockPath = resolveFlockPath(workspaceId)
  const release = await acquireFlock(lockPath, waitMs)
  if (!release) {
    throw new WorkspaceLockTimeoutError(workspaceId, waitMs)
  }
  try {
    return await run()
  }
  finally {
    await release()
  }
}

async function withPostgresLock<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  const waitMs = getLockWaitMs()
  const [key1, key2] = advisoryLockKeys(workspaceId)
  // Lazy import so flock-only tests/dev without DB do not load Better Auth.
  const { getPool } = await import('@fluffmind/db')
  const client = await getPool().connect()

  try {
    const started = Date.now()
    while (true) {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1, $2) AS locked',
        [key1, key2],
      )
      if (result.rows[0]?.locked) break

      if (Date.now() - started >= waitMs) {
        throw new WorkspaceLockTimeoutError(workspaceId, waitMs)
      }
      await delay(50)
    }

    try {
      return await run()
    }
    finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [key1, key2])
    }
  }
  finally {
    client.release()
  }
}

/**
 * Serialize vault mutations for a workspace across processes (Postgres advisory lock
 * when DATABASE_URL is set, otherwise cross-process file lock) and within the current
 * process (promise chain). Rejects immediately when `VAULT_READONLY=true`.
 */
export function withWorkspaceLock<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  try {
    assertVaultWritable()
  }
  catch (error) {
    return Promise.reject(error)
  }
  return withLocalChain(workspaceId, () => {
    if (usePostgresLock()) {
      return withPostgresLock(workspaceId, run)
    }
    return withFlockLock(workspaceId, run)
  })
}

/** @internal test helpers — not part of the public vault API */
export const __testOnly = {
  resetLocalChains(): void {
    localChains.clear()
  },
  acquireFlockForTests(lockPath: string): Promise<() => Promise<void>> {
    return acquireFlock(lockPath, 5_000).then((release) => {
      if (!release) throw new Error('Failed to acquire test flock')
      return release
    })
  },
}
