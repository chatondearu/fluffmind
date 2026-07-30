import type { H3Event } from 'h3'
import { createRouter } from 'radix3'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAgentBearer: vi.fn(),
  assertAgentWriteScope: vi.fn(),
  getWorkspaceInfo: vi.fn(),
  searchNotes: vi.fn(),
  readNoteById: vi.fn(),
  writeNoteContent: vi.fn(),
  listBacklinks: vi.fn(),
  getVaultGraph: vi.fn(),
  createTask: vi.fn(),
  readJsonBody: vi.fn(),
}))

vi.mock('../../utils/agent-auth', () => ({
  requireAgentBearer: mocks.requireAgentBearer,
  assertAgentWriteScope: mocks.assertAgentWriteScope,
}))

vi.mock('../../mcp/handlers', () => ({
  getWorkspaceInfo: mocks.getWorkspaceInfo,
  searchNotes: mocks.searchNotes,
  readNoteById: mocks.readNoteById,
  writeNoteContent: mocks.writeNoteContent,
  listBacklinks: mocks.listBacklinks,
  getVaultGraph: mocks.getVaultGraph,
  createTask: mocks.createTask,
}))

vi.mock('../../utils/read-json-body', () => ({
  readJsonBody: mocks.readJsonBody,
}))

function stubCreateError() {
  vi.stubGlobal('createError', (options: {
    statusCode: number
    statusMessage: string
    message?: string
  }) => Object.assign(new Error(options.message ?? options.statusMessage), options))
}

const auth = { workspaceId: 'org_1', scope: 'read' as const, tokenId: 'tok_1' }
const writeAuth = { workspaceId: 'org_1', scope: 'write' as const, tokenId: 'tok_1' }

const fakeEvent = {} as H3Event

let handlers: {
  workspace: (event: H3Event) => unknown
  search: (event: H3Event) => unknown
  readNote: (event: H3Event) => unknown
  writeNote: (event: H3Event) => unknown
  backlinks: (event: H3Event) => unknown
  graph: (event: H3Event) => unknown
  createTask: (event: H3Event) => unknown
}

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)

  handlers = {
    workspace: (await import('./workspace.get')).default,
    search: (await import('./notes/search.get')).default,
    readNote: (await import('./notes/[...id].get')).default,
    writeNote: (await import('./notes/[...id].put')).default,
    // `notes/[...id]/backlinks.get.ts` was unreachable: Nitro/h3's radix3
    // router resolves the catch-all `notes/[...id]` for any deeper path
    // segment, so a dedicated backlinks route file never matches. Backlinks
    // is dispatched from the combined `notes/[...id]` GET handler instead.
    backlinks: (await import('./notes/[...id].get')).default,
    graph: (await import('./graph.get')).default,
    createTask: (await import('./tasks.post')).default,
  }
})

beforeEach(() => {
  stubCreateError()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('GET /api/agent/workspace', () => {
  it('returns the workspace bound to the Bearer token', async () => {
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.getWorkspaceInfo.mockResolvedValue({ id: 'org_1', name: 'Org', slug: 'org', scope: 'read', agentEnabled: true })

    const result = await handlers.workspace(fakeEvent)

    expect(mocks.getWorkspaceInfo).toHaveBeenCalledWith(auth)
    expect(result).toEqual({ id: 'org_1', name: 'Org', slug: 'org', scope: 'read', agentEnabled: true })
  })

  it('propagates 401 from requireAgentBearer', async () => {
    mocks.requireAgentBearer.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))

    await expect(handlers.workspace(fakeEvent)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('GET /api/agent/notes/search', () => {
  it('returns matches (200)', async () => {
    vi.stubGlobal('getQuery', () => ({ q: 'alpha', limit: '5' }))
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.searchNotes.mockResolvedValue([{ id: 'alpha', title: 'Alpha' }])

    const result = await handlers.search(fakeEvent)

    expect(mocks.searchNotes).toHaveBeenCalledWith('alpha', 5, 'org_1')
    expect(result).toEqual([{ id: 'alpha', title: 'Alpha' }])
  })

  it('defaults to an empty query and limit 20', async () => {
    vi.stubGlobal('getQuery', () => ({}))
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.searchNotes.mockResolvedValue([])

    await handlers.search(fakeEvent)

    expect(mocks.searchNotes).toHaveBeenCalledWith('', 20, 'org_1')
  })
})

describe('GET /api/agent/notes/[...id]', () => {
  it('returns the note', async () => {
    vi.stubGlobal('getRouterParam', () => 'alpha')
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.readNoteById.mockResolvedValue({ id: 'alpha', title: 'Alpha', frontmatter: {}, content: '# Alpha' })

    const result = await handlers.readNote(fakeEvent)

    expect(result).toEqual({ id: 'alpha', title: 'Alpha', frontmatter: {}, content: '# Alpha' })
  })

  it('404s when the note does not exist', async () => {
    vi.stubGlobal('getRouterParam', () => 'missing')
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.readNoteById.mockResolvedValue(null)

    await expect(handlers.readNote(fakeEvent)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('PUT /api/agent/notes/[...id]', () => {
  it('writes the note when the token has write scope', async () => {
    vi.stubGlobal('getRouterParam', () => 'alpha')
    mocks.requireAgentBearer.mockResolvedValue(writeAuth)
    mocks.assertAgentWriteScope.mockImplementation(() => {})
    mocks.readJsonBody.mockResolvedValue({ content: '# Alpha\n' })
    mocks.writeNoteContent.mockResolvedValue({ committed: true, pushed: false })

    const result = await handlers.writeNote(fakeEvent)

    expect(mocks.writeNoteContent).toHaveBeenCalledWith(writeAuth, 'alpha', '# Alpha\n')
    expect(result).toEqual({ committed: true, pushed: false })
  })

  it('rejects read-scoped tokens with 403 (write skipped)', async () => {
    vi.stubGlobal('getRouterParam', () => 'alpha')
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.assertAgentWriteScope.mockImplementation((scope: string) => {
      if (scope !== 'write') throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'This agent token is read-only.' })
    })

    await expect(handlers.writeNote(fakeEvent)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.writeNoteContent).not.toHaveBeenCalled()
  })

  it('rejects a missing content body with 400', async () => {
    vi.stubGlobal('getRouterParam', () => 'alpha')
    mocks.requireAgentBearer.mockResolvedValue(writeAuth)
    mocks.assertAgentWriteScope.mockImplementation(() => {})
    mocks.readJsonBody.mockResolvedValue({})

    await expect(handlers.writeNote(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.writeNoteContent).not.toHaveBeenCalled()
  })
})

describe('Nitro file-based routing for notes/[...id]', () => {
  // Regression test for the shadowing bug: Nitro/h3 convert the catch-all
  // segment `[...id]` into the radix3 pattern `**:id`, which matches *any*
  // depth of trailing path segments — including a would-be sibling route
  // file at `notes/[...id]/backlinks.get.ts` (radix3 pattern
  // `**:id/backlinks`). Because the catch-all is registered too, radix3
  // always resolves the shallower catch-all first and the dedicated
  // backlinks route is never reached. This proves the routing behavior
  // independently of the mocked handler tests above.
  function buildRouter() {
    const router = createRouter<{ file: string }>()
    router.insert('/api/agent/notes/**:id', { file: 'notes/[...id].get.ts' })
    return router
  }

  it('resolves /api/agent/notes/alpha to the catch-all with id "alpha"', () => {
    const router = buildRouter()
    expect(router.lookup('/api/agent/notes/alpha')).toEqual({
      file: 'notes/[...id].get.ts',
      params: { id: 'alpha' },
    })
  })

  it('would shadow a dedicated notes/[...id]/backlinks route with id "alpha/backlinks"', () => {
    const router = buildRouter()
    router.insert('/api/agent/notes/**:id/backlinks', { file: 'notes/[...id]/backlinks.get.ts' })

    // If this ever resolves to the backlinks file, Nitro's router behavior
    // has changed and the merged-handler workaround below can be reverted.
    expect(router.lookup('/api/agent/notes/alpha/backlinks')).toEqual({
      file: 'notes/[...id].get.ts',
      params: { id: 'alpha/backlinks' },
    })
  })
})

describe('GET /api/agent/notes/[...id]/backlinks', () => {
  // Nitro/h3 (radix3) resolves `/api/agent/notes/beta/backlinks` against the
  // catch-all `notes/[...id]` route, handing the combined `id` param
  // `beta/backlinks` — never the standalone `notes/[...id]/backlinks`
  // route file (radix3 always prefers the more specific static/catch-all
  // match at the shallower segment). getRouterParam is stubbed here to
  // mirror that real resolution instead of assuming a dedicated route.
  it('lists backlinks when the catch-all id ends with /backlinks', async () => {
    vi.stubGlobal('getRouterParam', () => 'beta/backlinks')
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.listBacklinks.mockResolvedValue([{ id: 'alpha', title: 'Alpha' }])

    const result = await handlers.backlinks(fakeEvent)

    expect(mocks.listBacklinks).toHaveBeenCalledWith('beta', 'org_1')
    expect(mocks.readNoteById).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: 'alpha', title: 'Alpha' }])
  })

  it('lists backlinks for a nested note id ending with /backlinks', async () => {
    vi.stubGlobal('getRouterParam', () => 'projects/beta/backlinks')
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.listBacklinks.mockResolvedValue([])

    await handlers.backlinks(fakeEvent)

    expect(mocks.listBacklinks).toHaveBeenCalledWith('projects/beta', 'org_1')
  })

  it('does not treat a note literally named "backlinks" as the backlinks route', async () => {
    vi.stubGlobal('getRouterParam', () => 'backlinks')
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.readNoteById.mockResolvedValue({ id: 'backlinks', title: 'Backlinks', frontmatter: {}, content: '' })

    const result = await handlers.readNote(fakeEvent)

    expect(mocks.readNoteById).toHaveBeenCalledWith('backlinks', 'org_1')
    expect(result).toMatchObject({ id: 'backlinks' })
  })
})

describe('GET /api/agent/graph', () => {
  it('returns the vault graph', async () => {
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.getVaultGraph.mockResolvedValue({ nodes: [], edges: [] })

    const result = await handlers.graph(fakeEvent)

    expect(mocks.getVaultGraph).toHaveBeenCalledWith('org_1')
    expect(result).toEqual({ nodes: [], edges: [] })
  })
})

describe('POST /api/agent/tasks', () => {
  it('creates a task when the token has write scope', async () => {
    mocks.requireAgentBearer.mockResolvedValue(writeAuth)
    mocks.assertAgentWriteScope.mockImplementation(() => {})
    mocks.readJsonBody.mockResolvedValue({ content: 'Ship it', noteId: 'inbox/tasks' })
    mocks.createTask.mockResolvedValue({ noteId: 'inbox/tasks', content: '# Tasks\n\n- [ ] Ship it\n' })

    const result = await handlers.createTask(fakeEvent)

    expect(mocks.createTask).toHaveBeenCalledWith(writeAuth, 'Ship it', 'inbox/tasks')
    expect(result).toEqual({ noteId: 'inbox/tasks', content: '# Tasks\n\n- [ ] Ship it\n' })
  })

  it('rejects read-scoped tokens with 403', async () => {
    mocks.requireAgentBearer.mockResolvedValue(auth)
    mocks.assertAgentWriteScope.mockImplementation(() => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'This agent token is read-only.' })
    })

    await expect(handlers.createTask(fakeEvent)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.createTask).not.toHaveBeenCalled()
  })
})
