import type { H3Event } from 'h3'
import { writeToWorkspace, GitConflictError } from '../../vault/write'

/**
 * Reads and JSON-parses the request body straight from the underlying Node stream,
 * bypassing Nitro's auto-imported `readBody`. Real bug found while testing this route:
 * this monorepo resolves two copies of `h3` (Nitro's own 1.x, and a 2.x-rc pulled in
 * transitively by @nuxt/eslint's devtools config-inspector) — the auto-imported
 * `readBody` binds to the 2.x-rc build, which expects a Web `Request`-style
 * `event.req.text()` that doesn't exist on the 1.x Node-based event Nitro actually
 * constructs at runtime, crashing every request with a body. `event.node.req` is the
 * real Node `IncomingMessage` on the 1.x event, unaffected by that mismatch.
 */
async function readJsonBody<T>(event: H3Event): Promise<T> {
  if (!event.node) throw createError({ statusCode: 500, statusMessage: 'Not running on the Node adapter' })
  const chunks: Buffer[] = []
  for await (const chunk of event.node.req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T
}

/**
 * Minimal, raw write endpoint for the P1 Git sync spike — not the real editor write
 * path (that comes with the block editor in P3). Just enough surface to exercise
 * writeToWorkspace end to end.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const body = await readJsonBody<{ content?: string }>(event)
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }

  try {
    return await writeToWorkspace('default', id, body.content)
  } catch (error) {
    if (error instanceof GitConflictError) {
      // statusMessage becomes the raw HTTP reason phrase (restricted charset — Node
      // mangles non-ASCII like the em dash in error.message); keep it short and put
      // the real detail in `message`, which flows into the JSON body untouched.
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: error.message })
    }
    throw error
  }
})
