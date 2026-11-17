#!/usr/bin/env node
/**
 * Launcher lifecycle smoke for an unpacked portable package (PLAN-152 seam 1):
 * start → app + daemon healthy → note save through the daemon → stop → nothing left running.
 *
 * Usage: node scripts/portable-smoke.mjs <package dir>   (e.g. dist/portable/fluffmind-linux-x64)
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const pkg = resolve(process.argv[2] ?? '')
const win = process.platform === 'win32'
const launcher = join(pkg, 'bin', win ? 'fluffmind.cmd' : 'fluffmind')

function assert(cond, message) {
  if (!cond)
    throw new Error(`portable smoke failed: ${message}`)
}

const freePort = () => new Promise((ok) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const { port } = srv.address()
    srv.close(() => ok(port))
  })
})

const up = url => fetch(url, { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false)

async function until(check, what, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await check())
      return
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`portable smoke failed: timed out waiting for ${what}`)
}

const files = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])

const vault = mkdtempSync(join(tmpdir(), 'fluffmind-smoke-'))
const [port, daemonPort] = [await freePort(), await freePort()]
const run = command => spawnSync(
  launcher,
  [command, '--no-open', '--vault', vault, '--port', String(port), '--daemon-port', String(daemonPort)],
  { cwd: pkg, stdio: 'inherit', shell: win },
)

try {
  assert(run('start').status === 0, 'launcher start failed')
  const [app, daemon] = [`http://127.0.0.1:${port}`, `http://127.0.0.1:${daemonPort}`]
  await until(() => up(`${app}/api/health`), 'the app')
  assert(await up(`${daemon}/health`), 'daemon not healthy after start')

  // Through the Nitro /__daemon proxy, as the browser does when NUXT_PUBLIC_DAEMON_URL is set.
  const put = await fetch(`${app}/__daemon/v1/notes`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'smoke', content: 'portable-ok\n' }),
  })
  assert(put.status === 201, `PUT /v1/notes via proxy returned ${put.status}`)
  const landed = files(join(vault, 'writers')).filter(f => readFileSync(f, 'utf8') === 'portable-ok\n')
  assert(landed.length === 1 && /writers[\\/]device[\\/]/.test(landed[0]), 'note not under writers/device/')
  statSync(join(pkg, 'data', 'daemon', 'node.key'))

  assert(run('stop').status === 0, 'launcher stop failed')
  await until(async () => !(await up(`${daemon}/health`)) && !(await up(`${app}/api/health`)), 'app and daemon to stop', 20)
  console.log('portable smoke: ok')
}
finally {
  run('stop')
}
