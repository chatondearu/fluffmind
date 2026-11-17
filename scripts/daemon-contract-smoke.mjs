#!/usr/bin/env node
/**
 * HTTP contract smoke for fluffmind-daemon (PLAN-150): the assertions of the former Node
 * `--self-check`, run over a real socket against any daemon.
 *
 * Usage: node scripts/daemon-contract-smoke.mjs <baseUrl> [--vault <dir>]
 *   --vault  also checks the file on disk (daemon must share that vault)
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const [baseArg, flag, vault] = process.argv.slice(2)
const base = baseArg?.replace(/\/$/, '')
if (!base || (flag && flag !== '--vault')) {
  console.error('Usage: daemon-contract-smoke.mjs <baseUrl> [--vault <dir>]')
  process.exit(2)
}

function assert(cond, message) {
  if (!cond)
    throw new Error(`contract smoke failed: ${message}`)
}

const call = (method, path, body) => fetch(`${base}${path}`, {
  method,
  headers: body ? { 'content-type': 'application/json' } : undefined,
  body: body ? JSON.stringify(body) : undefined,
})

const stamp = Date.now().toString(36)
const id = `smoke-${stamp}`

const health = await call('GET', '/health')
assert(health.ok, `health HTTP ${health.status}`)
assert((await health.json()).ok === true, 'health ok')

const put = await call('PUT', '/v1/notes', { id, content: 'http-ok\n' })
assert(put.status === 201, `PUT status ${put.status}`)
const created = await put.json()
assert(created.id === `writers/device/solo/${id}`, `PUT id ${created.id}`)
assert(created.committed === false && created.pushed === false, 'PUT must not touch Git')
assert(created.created === true, 'PUT created flag')
assert(created.contentHash === createHash('sha256').update('http-ok\n').digest('hex'), `PUT contentHash ${created.contentHash}`)
if (vault)
  assert(await readFile(join(vault, `${created.id}.md`), 'utf-8') === 'http-ok\n', 'file content on disk')

const again = await call('PUT', '/v1/notes', { id, content: 'v2\n' })
assert(again.status === 200 && (await again.json()).created === false, `update status ${again.status}`)

const get = await call('GET', `/v1/notes?id=${id}`)
assert(get.ok, `GET HTTP ${get.status}`)
assert((await get.json()).content === 'v2\n', 'GET content mismatch')

assert((await call('GET', `/v1/notes?id=missing-${stamp}`)).status === 404, 'GET missing must be 404')
assert((await call('GET', '/v1/notes')).status === 400, 'GET without id must be 400')

const forbidden = await call('PUT', '/v1/notes', {
  id: 'writers/user/alice/stolen',
  content: 'nope',
  writer: 'device:solo',
})
assert(forbidden.status === 400, `prefix reject status ${forbidden.status}`)
assert(typeof (await forbidden.json()).error === 'string', 'error body has "error"')

console.log('contract smoke: ok')
