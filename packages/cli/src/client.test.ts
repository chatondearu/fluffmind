import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FluffmindClient, FluffmindHttpError } from './client.ts'

function jsonResponse(body: unknown, init: { ok?: boolean, status?: number, statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  }
}

describe('FluffmindClient', () => {
  const config = { url: 'https://vault.example.com', token: 'fm_agent_test' }
  let fetchMock: Mock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function calledUrl(callIndex = 0): URL {
    return new URL(fetchMock.mock.calls[callIndex][0] as string)
  }

  function calledInit(callIndex = 0): RequestInit {
    return fetchMock.mock.calls[callIndex][1] as RequestInit
  }

  it('whoami() GETs /api/agent/workspace with the Bearer token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'org_1' }))
    const client = new FluffmindClient(config)

    const result = await client.whoami()

    expect(calledUrl().pathname).toBe('/api/agent/workspace')
    expect(calledInit().method).toBe('GET')
    expect((calledInit().headers as Record<string, string>).Authorization).toBe('Bearer fm_agent_test')
    expect(result).toEqual({ id: 'org_1' })
  })

  it('search() GETs /api/agent/notes/search?q=&limit=', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'alpha' }]))
    const client = new FluffmindClient(config)

    const result = await client.search('alpha', 5)

    const url = calledUrl()
    expect(url.pathname).toBe('/api/agent/notes/search')
    expect(url.searchParams.get('q')).toBe('alpha')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(result).toEqual([{ id: 'alpha' }])
  })

  it('search() omits limit when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    const client = new FluffmindClient(config)

    await client.search('alpha')

    expect(calledUrl().searchParams.has('limit')).toBe(false)
  })

  it('read() GETs /api/agent/notes/:id, encoding segments but preserving slashes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'projects/beta' }))
    const client = new FluffmindClient(config)

    await client.read('projects/beta note')

    expect(calledUrl().pathname).toBe('/api/agent/notes/projects/beta%20note')
  })

  it('write() PUTs { content } as a JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ committed: true, pushed: false }))
    const client = new FluffmindClient(config)

    const result = await client.write('alpha', '# Alpha\n')

    expect(calledUrl().pathname).toBe('/api/agent/notes/alpha')
    const init = calledInit()
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ content: '# Alpha\n' })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(result).toEqual({ committed: true, pushed: false })
  })

  it('backlinks() GETs /api/agent/notes/:id/backlinks', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'alpha' }]))
    const client = new FluffmindClient(config)

    await client.backlinks('projects/beta')

    expect(calledUrl().pathname).toBe('/api/agent/notes/projects/beta/backlinks')
  })

  it('graph() GETs /api/agent/graph', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nodes: [], edges: [] }))
    const client = new FluffmindClient(config)

    await client.graph()

    expect(calledUrl().pathname).toBe('/api/agent/graph')
  })

  it('task() POSTs { content, noteId } as a JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ noteId: 'inbox/tasks' }))
    const client = new FluffmindClient(config)

    await client.task('Ship it', 'inbox/tasks')

    expect(calledUrl().pathname).toBe('/api/agent/tasks')
    const init = calledInit()
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ content: 'Ship it', noteId: 'inbox/tasks' })
  })

  it('task() omits noteId when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const client = new FluffmindClient(config)

    await client.task('Ship it')

    const init = calledInit()
    expect(JSON.parse(init.body as string)).toEqual({ content: 'Ship it' })
  })

  it('throws FluffmindHttpError on non-ok responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'This agent token is read-only.' }, {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }))
    const client = new FluffmindClient(config)

    await expect(client.write('alpha', 'x')).rejects.toMatchObject(
      new FluffmindHttpError(403, 'This agent token is read-only.'),
    )
  })

  it('falls back to statusText when the error body has no message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('not json') },
    })
    const client = new FluffmindClient(config)

    await expect(client.graph()).rejects.toMatchObject({ statusCode: 500, message: 'Internal Server Error' })
  })
})
