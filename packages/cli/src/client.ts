import type { FluffmindConfig } from './config.ts'

/** Thrown for any non-2xx response from `/api/agent/*`. `statusCode` mirrors the HTTP status. */
export class FluffmindHttpError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'FluffmindHttpError'
    this.statusCode = statusCode
  }
}

/** Encodes each `/`-separated segment individually so note ids like `projects/beta` keep their shape. */
function encodeNoteId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/')
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown, statusMessage?: unknown }
    if (typeof body?.message === 'string' && body.message)
      return body.message
    if (typeof body?.statusMessage === 'string' && body.statusMessage)
      return body.statusMessage
  }
  catch {
    // Error body wasn't JSON (or was empty) — fall through to statusText.
  }
  return response.statusText
}

/** Thin HTTP client for the `/api/agent/*` REST surface (PRD-037). No retries, no caching. */
export class FluffmindClient {
  private readonly config: FluffmindConfig

  constructor(config: FluffmindConfig) {
    this.config = config
  }

  whoami(): Promise<unknown> {
    return this.request('GET', '/api/agent/workspace')
  }

  search(query: string, limit?: number): Promise<unknown> {
    const params = new URLSearchParams({ q: query })
    if (limit !== undefined)
      params.set('limit', String(limit))
    return this.request('GET', `/api/agent/notes/search?${params.toString()}`)
  }

  read(id: string): Promise<unknown> {
    return this.request('GET', `/api/agent/notes/${encodeNoteId(id)}`)
  }

  write(id: string, content: string): Promise<unknown> {
    return this.request('PUT', `/api/agent/notes/${encodeNoteId(id)}`, { content })
  }

  backlinks(id: string): Promise<unknown> {
    return this.request('GET', `/api/agent/notes/${encodeNoteId(id)}/backlinks`)
  }

  graph(): Promise<unknown> {
    return this.request('GET', '/api/agent/graph')
  }

  task(content: string, noteId?: string): Promise<unknown> {
    return this.request('POST', '/api/agent/tasks', noteId ? { content, noteId } : { content })
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = new URL(path, this.config.url)
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok)
      throw new FluffmindHttpError(response.status, await extractErrorMessage(response))

    return response.json()
  }
}
