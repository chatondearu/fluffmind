#!/usr/bin/env node
/**
 * Forward start/stop/status/run to the local portable package under dist/portable/.
 *
 * Usage:
 *   node scripts/run-portable.mjs start [--vault …] [--port …]
 *   node scripts/run-portable.mjs stop
 *   node scripts/run-portable.mjs status
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const PORTABLE_ROOT = join(REPO_ROOT, 'dist', 'portable')

function detectCurrentTarget() {
  const { platform, arch } = process
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  throw new Error(`Unsupported host platform: ${platform}/${arch}`)
}

function resolveLauncher(packageDir) {
  if (process.platform === 'win32') {
    return join(packageDir, 'bin', 'fluffmind.cmd')
  }
  return join(packageDir, 'bin', 'fluffmind')
}

function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'start'
  const forwarded = args.slice(1)

  if (!['start', 'stop', 'status', 'run'].includes(command)) {
    console.error(`Unknown command: ${command}`)
    console.error('Usage: node scripts/run-portable.mjs <start|stop|status|run> [options…]')
    process.exit(1)
  }

  const target = detectCurrentTarget()
  const packageDir = join(PORTABLE_ROOT, `fluffmind-${target}`)
  const launcher = resolveLauncher(packageDir)

  if (!existsSync(launcher)) {
    console.error(`Portable package not found at:\n  ${packageDir}`)
    console.error('Build it first:\n  pnpm package:portable')
    process.exit(1)
  }

  const result = spawnSync(launcher, [command, ...forwarded], {
    cwd: packageDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

main()
