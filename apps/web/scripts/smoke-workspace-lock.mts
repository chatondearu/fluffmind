#!/usr/bin/env node
/**
 * Smoke: two processes serialize on the same workspace via flock (no DATABASE_URL).
 *
 * Usage:
 *   node --experimental-strip-types apps/web/scripts/smoke-workspace-lock.mts
 *   # or: pnpm --filter @fluffmind/web exec tsx scripts/smoke-workspace-lock.mts
 */
import { fork } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isWorker = process.argv.includes('--worker')

if (isWorker) {
  const { withWorkspaceLock } = await import('../server/vault/lock.ts')
  const workspaceId = process.env.SMOKE_WORKSPACE_ID || 'smoke'
  const marker = process.env.SMOKE_MARKER!
  const orderFile = process.env.SMOKE_ORDER_FILE!

  await withWorkspaceLock(workspaceId, async () => {
    const { appendFile } = await import('node:fs/promises')
    const { setTimeout: delay } = await import('node:timers/promises')
    await appendFile(orderFile, `${marker}-start\n`, 'utf-8')
    await delay(80)
    await appendFile(orderFile, `${marker}-end\n`, 'utf-8')
  })
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), 'fluffmind-lock-smoke-'))
const orderFile = join(root, 'order.txt')
await writeFile(orderFile, '', 'utf-8')

process.env.WORKSPACES_ROOT = root
delete process.env.DATABASE_URL

const script = fileURLToPath(import.meta.url)
const env = {
  ...process.env,
  WORKSPACES_ROOT: root,
  SMOKE_ORDER_FILE: orderFile,
  SMOKE_WORKSPACE_ID: 'smoke',
}

function runWorker(marker: string) {
  return new Promise<void>((resolve, reject) => {
    const child = fork(script, ['--worker'], {
      env: { ...env, SMOKE_MARKER: marker },
      execArgv: ['--import', 'tsx'],
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`worker ${marker} exited ${code}`))
    })
    child.on('error', reject)
  })
}

try {
  await Promise.all([runWorker('a'), runWorker('b')])
  const { readFile } = await import('node:fs/promises')
  const lines = (await readFile(orderFile, 'utf-8')).trim().split('\n')
  const ok
    = (lines[0] === 'a-start' && lines[1] === 'a-end' && lines[2] === 'b-start' && lines[3] === 'b-end')
      || (lines[0] === 'b-start' && lines[1] === 'b-end' && lines[2] === 'a-start' && lines[3] === 'a-end')
  if (!ok) {
    console.error('Unexpected order:', lines)
    process.exit(1)
  }
  console.log('smoke-workspace-lock: OK', lines.join(' '))
}
finally {
  await rm(root, { recursive: true, force: true })
}
