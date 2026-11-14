import { describe, expect, it } from 'vitest'
import { createInMemoryMeshHub } from './in-memory.ts'
import type { MeshFileUpdate } from './types.ts'

describe('InMemoryMeshHub', () => {
  it('exchanges a file update between two peers', async () => {
    const hub = createInMemoryMeshHub()
    const alice = hub.join('alice')
    const bob = hub.join('bob')

    const received: MeshFileUpdate[] = []
    bob.onUpdate(update => received.push(update))

    await alice.publish({
      path: 'writers/user/alice/notes/hello.md',
      content: '# hello from alice\n',
      mtimeMs: 1_700_000_000_000,
    })

    expect(received).toEqual([{
      path: 'writers/user/alice/notes/hello.md',
      content: '# hello from alice\n',
      mtimeMs: 1_700_000_000_000,
      peerId: 'alice',
    }])

    await alice.close()
    await bob.close()
  })

  it('does not echo publishes to the sender', async () => {
    const hub = createInMemoryMeshHub()
    const alice = hub.join('alice')
    const bob = hub.join('bob')

    const aliceInbox: MeshFileUpdate[] = []
    alice.onUpdate(update => aliceInbox.push(update))

    await alice.publish({
      path: 'a.md',
      content: 'x',
      mtimeMs: 1,
    })

    expect(aliceInbox).toEqual([])
    await bob.close()
    await alice.close()
  })
})
