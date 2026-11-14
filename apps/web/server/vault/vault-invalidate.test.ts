import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearVaultInvalidateSubscribers,
  publishVaultInvalidate,
  subscribeVaultInvalidate,
} from './vault-invalidate'
import { clearVaultWsPeers, registerVaultWsPeer } from './vault-ws-peers'

describe('vault invalidate hub', () => {
  afterEach(() => {
    clearVaultInvalidateSubscribers()
    clearVaultWsPeers()
  })

  it('delivers an event to a second subscriber after publish', () => {
    const first: unknown[] = []
    const second: unknown[] = []
    subscribeVaultInvalidate('ws-a', e => first.push(e))
    subscribeVaultInvalidate('ws-a', e => second.push(e))
    subscribeVaultInvalidate('ws-b', () => {
      throw new Error('wrong workspace')
    })

    const event = publishVaultInvalidate('ws-a', {
      reason: 'note-write',
      noteId: 'writers/user/alice/hello',
    })

    expect(event.type).toBe('vault-invalidate')
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first[0]).toMatchObject({
      workspaceId: 'ws-a',
      reason: 'note-write',
      noteId: 'writers/user/alice/hello',
    })
    expect(second[0]).toEqual(first[0])
  })

  it('fans out to registered WebSocket peers', () => {
    const send = vi.fn()
    registerVaultWsPeer('ws-a', { id: 'peer-1', send })

    publishVaultInvalidate('ws-a', { reason: 'note-publish', noteId: 'hello' })

    expect(send).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(send.mock.calls[0]![0] as string)
    expect(payload).toMatchObject({
      type: 'vault-invalidate',
      workspaceId: 'ws-a',
      reason: 'note-publish',
      noteId: 'hello',
    })
  })
})
