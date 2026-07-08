import type { H3Event } from 'h3'

/**
 * Reads and JSON-parses the request body from the underlying Node stream, bypassing
 * Nitro's auto-imported `readBody`. Kept as defense in depth — see apps/web/AGENTS.md.
 */
export async function readJsonBody<T>(event: H3Event): Promise<T> {
  if (!event.node) throw createError({ statusCode: 500, statusMessage: 'Not running on the Node adapter' })
  const chunks: Buffer[] = []
  for await (const chunk of event.node.req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T
}
