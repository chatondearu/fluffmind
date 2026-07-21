#!/usr/bin/env node
/**
 * Assemble a portable Fluffmind solo package (PRD-032).
 *
 * Usage:
 *   node scripts/package-portable.mjs [--target <id>|current|all] [--skip-build] [--out-dir <dir>]
 *
 * Targets: darwin-arm64, darwin-x64, linux-x64, win-x64
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const PORTABLE_TEMPLATES = join(__dirname, 'portable')

/** Pin Node major to match Dockerfile `node:22-*`. Bump deliberately. */
const NODE_VERSION = process.env.FLUFFMIND_NODE_VERSION || '22.17.0'

const TARGETS = {
  'darwin-arm64': {
    node: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    archive: 'tar.gz',
    nodeDirName: `node-v${NODE_VERSION}-darwin-arm64`,
    isWindows: false,
  },
  'darwin-x64': {
    node: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    archive: 'tar.gz',
    nodeDirName: `node-v${NODE_VERSION}-darwin-x64`,
    isWindows: false,
  },
  'linux-x64': {
    node: `node-v${NODE_VERSION}-linux-x64.tar.gz`,
    archive: 'tar.gz',
    nodeDirName: `node-v${NODE_VERSION}-linux-x64`,
    isWindows: false,
  },
  'win-x64': {
    node: `node-v${NODE_VERSION}-win-x64.zip`,
    archive: 'zip',
    nodeDirName: `node-v${NODE_VERSION}-win-x64`,
    isWindows: true,
  },
}

function parseArgs(argv) {
  const opts = {
    target: 'current',
    skipBuild: false,
    outDir: join(REPO_ROOT, 'dist', 'portable'),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    if (a === '--target') opts.target = argv[++i]
    else if (a === '--skip-build') opts.skipBuild = true
    else if (a === '--out-dir') opts.outDir = resolve(argv[++i])
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/package-portable.mjs [--target current|all|${Object.keys(TARGETS).join('|')}] [--skip-build] [--out-dir dir]`)
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${a}`)
    }
  }
  return opts
}

function detectCurrentTarget() {
  const { platform, arch } = process
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  throw new Error(`Unsupported host platform for --target current: ${platform}/${arch}`)
}

function resolveTargets(spec) {
  if (spec === 'all') return Object.keys(TARGETS)
  if (spec === 'current') return [detectCurrentTarget()]
  if (!TARGETS[spec]) throw new Error(`Unknown target "${spec}"`)
  return [spec]
}

function ensureWebBuild(skipBuild) {
  const outputDir = join(REPO_ROOT, 'apps', 'web', '.output')
  const entry = join(outputDir, 'server', 'index.mjs')
  if (skipBuild) {
    if (!existsSync(entry)) {
      throw new Error(`--skip-build but missing ${entry}; run pnpm build first`)
    }
    return outputDir
  }
  console.log('→ building @fluffmind/web …')
  execFileSync('pnpm', ['turbo', 'run', 'build', '--filter=@fluffmind/web'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NUXT_TELEMETRY_DISABLED: '1',
    },
  })
  if (!existsSync(entry)) {
    throw new Error(`Build finished but missing ${entry}`)
  }
  return outputDir
}

async function download(url, dest) {
  console.log(`→ download ${url}`)
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  await mkdir(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

async function extractNodeArchive(archivePath, kind, stagingDir) {
  await mkdir(stagingDir, { recursive: true })
  if (kind === 'tar.gz') {
    execFileSync('tar', ['-xzf', archivePath, '-C', stagingDir], { stdio: 'inherit' })
    return
  }
  const unzip = spawnSync('unzip', ['-q', archivePath, '-d', stagingDir], { stdio: 'inherit' })
  if (unzip.status !== 0) {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${stagingDir.replace(/'/g, "''")}' -Force`],
      { stdio: 'inherit' },
    )
  }
}

async function assembleTarget(targetId, webOutput, outDir, cacheDir) {
  const meta = TARGETS[targetId]
  const packageName = `fluffmind-${targetId}`
  const packageDir = join(outDir, packageName)
  await rm(packageDir, { recursive: true, force: true })
  await mkdir(packageDir, { recursive: true })

  const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${meta.node}`
  const nodeArchive = join(cacheDir, meta.node)
  if (!existsSync(nodeArchive)) {
    await download(nodeUrl, nodeArchive)
  }
  else {
    console.log(`→ using cached ${meta.node}`)
  }

  const extractRoot = await mkdtemp(join(tmpdir(), 'fluffmind-node-'))
  try {
    await extractNodeArchive(nodeArchive, meta.archive === 'zip' ? 'zip' : 'tar.gz', extractRoot)
    const extracted = join(extractRoot, meta.nodeDirName)
    if (!existsSync(extracted)) {
      throw new Error(`Expected Node extract at ${extracted}`)
    }
    const runtimeNode = join(packageDir, 'runtime', 'node')
    await mkdir(dirname(runtimeNode), { recursive: true })
    await cp(extracted, runtimeNode, { recursive: true })
  }
  finally {
    await rm(extractRoot, { recursive: true, force: true })
  }

  const appOut = join(packageDir, 'app', '.output')
  await mkdir(dirname(appOut), { recursive: true })
  await cp(webOutput, appOut, { recursive: true })

  await mkdir(join(packageDir, 'bin'), { recursive: true })
  await mkdir(join(packageDir, 'vault'), { recursive: true })
  await mkdir(join(packageDir, 'data'), { recursive: true })
  await writeFile(join(packageDir, 'vault', 'README.md'), await readFile(join(PORTABLE_TEMPLATES, 'vault-README.md')))
  await writeFile(join(packageDir, 'data', '.gitkeep'), '')
  await copyFile(join(PORTABLE_TEMPLATES, 'README.txt'), join(packageDir, 'README.txt'))

  if (meta.isWindows) {
    await copyFile(join(PORTABLE_TEMPLATES, 'fluffmind.cmd'), join(packageDir, 'bin', 'fluffmind.cmd'))
  }
  else {
    const dest = join(packageDir, 'bin', 'fluffmind')
    await copyFile(join(PORTABLE_TEMPLATES, 'fluffmind.sh'), dest)
    await chmod(dest, 0o755)
    const nodeBin = join(packageDir, 'runtime', 'node', 'bin', 'node')
    if (existsSync(nodeBin)) await chmod(nodeBin, 0o755)
  }

  await mkdir(outDir, { recursive: true })
  if (meta.isWindows) {
    const zipPath = join(outDir, `${packageName}.zip`)
    await rm(zipPath, { force: true })
    const zip = spawnSync('zip', ['-r', zipPath, packageName], { cwd: outDir, stdio: 'inherit' })
    if (zip.status !== 0) {
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `Compress-Archive -Path '${packageDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`],
        { stdio: 'inherit' },
      )
    }
    return zipPath
  }

  const tarPath = join(outDir, `${packageName}.tar.gz`)
  await rm(tarPath, { force: true })
  execFileSync('tar', ['-czf', tarPath, packageName], { cwd: outDir, stdio: 'inherit' })
  return tarPath
}

async function writeChecksums(files, outDir) {
  const lines = []
  for (const file of files) {
    const buf = await readFile(file)
    const hash = createHash('sha256').update(buf).digest('hex')
    lines.push(`${hash}  ${basename(file)}`)
  }
  const sumsPath = join(outDir, 'SHA256SUMS')
  await writeFile(sumsPath, `${lines.join('\n')}\n`, 'utf-8')
  return sumsPath
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const targets = resolveTargets(opts.target)
  const webOutput = ensureWebBuild(opts.skipBuild)
  const outDir = opts.outDir
  await mkdir(outDir, { recursive: true })
  const cacheDir = join(outDir, '.cache')
  await mkdir(cacheDir, { recursive: true })

  const artifacts = []
  for (const target of targets) {
    console.log(`\n=== packaging ${target} ===`)
    const artifact = await assembleTarget(target, webOutput, outDir, cacheDir)
    artifacts.push(artifact)
    console.log(`✓ ${artifact}`)
  }

  await writeChecksums(artifacts, outDir)
  console.log(`\nDone. Artifacts in ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
