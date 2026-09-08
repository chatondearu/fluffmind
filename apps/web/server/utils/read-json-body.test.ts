import { afterEach, describe, expect, it, vi } from 'vitest'

import { readJsonBody } from './read-json-body'

function stubCreateError() {
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('x'), options))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readJsonBody', () => {
  it('returns empty object for empty body', async () => {
    stubCreateError()
    async function* empty() {}
    const event = {
      node: { req: empty() },
    }

    await expect(readJsonBody(event as never)).resolves.toEqual({})
  })

  it('parses a JSON body', async () => {
    stubCreateError()
    async function* chunks() {
      yield Buffer.from('{"workspaceId":"ws-1"}')
    }
    const event = {
      node: { req: chunks() },
    }

    await expect(readJsonBody(event as never)).resolves.toEqual({ workspaceId: 'ws-1' })
  })
})
