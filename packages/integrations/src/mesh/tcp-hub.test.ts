import { describe, expect, it } from 'vitest'
import { connectTcpMeshPeer, startTcpMeshHub } from './tcp-hub.ts'
import type { MeshFileUpdate } from './types.ts'

function waitForUpdate(
  peer: { onUpdate: (h: (u: MeshFileUpdate) => void) => () => void },
  timeoutMs = 2000,
): Promise<MeshFileUpdate> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for mesh update')), timeoutMs)
    const unsub = peer.onUpdate((update) => {
      clearTimeout(timer)
      unsub()
      resolve(update)
    })
  })
}

describe('TcpMeshHub', () => {
  it('exchanges a file update between two socket peers', async () => {
    const hub = await startTcpMeshHub()
    const alice = await connectTcpMeshPeer({ host: hub.host, port: hub.port, peerId: 'alice' })
    const bob = await connectTcpMeshPeer({ host: hub.host, port: hub.port, peerId: 'bob' })

    const pending = waitForUpdate(bob)

    await alice.publish({
      path: 'writers/user/alice/notes/hello.md',
      content: '# hello from alice over tcp\n',
      mtimeMs: 1_700_000_000_000,
    })

    const received = await pending
    expect(received).toEqual({
      path: 'writers/user/alice/notes/hello.md',
      content: '# hello from alice over tcp\n',
      mtimeMs: 1_700_000_000_000,
      peerId: 'alice',
    })

    await alice.close()
    await bob.close()
    await hub.close()
  })

  it('does not echo publishes to the sender', async () => {
    const hub = await startTcpMeshHub()
    const alice = await connectTcpMeshPeer({ host: hub.host, port: hub.port, peerId: 'alice' })
    const bob = await connectTcpMeshPeer({ host: hub.host, port: hub.port, peerId: 'bob' })

    const aliceInbox: MeshFileUpdate[] = []
    alice.onUpdate(update => aliceInbox.push(update))

    await alice.publish({
      path: 'a.md',
      content: 'x',
      mtimeMs: 1,
    })

    // Give the hub a tick to mis-route if it were going to echo.
    await new Promise(r => setTimeout(r, 50))
    expect(aliceInbox).toEqual([])

    await bob.close()
    await alice.close()
    await hub.close()
  })
})
