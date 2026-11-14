import { afterEach, describe, expect, it } from 'vitest'
import {
  noteIdForMeshWriter,
  writerIdentityForAgent,
  writerIdentityForSoloDevice,
  writerIdentityForUser,
} from './hosted-writer'
import { WriterPrefixViolationError } from './writer-prefix'

describe('hosted writer identities', () => {
  afterEach(() => {
    delete process.env.SYNC_WRITER_DEVICE
  })

  it('maps users and agents to distinct kinds', () => {
    expect(writerIdentityForUser('user_abc')).toEqual({ kind: 'user', id: 'user_abc' })
    expect(writerIdentityForAgent('tok_1')).toEqual({ kind: 'agent', id: 'tok_1' })
    expect(writerIdentityForUser('a')).not.toEqual(writerIdentityForUser('b'))
    expect(writerIdentityForUser('a')).toEqual(writerIdentityForUser('a'))
  })

  it('solo device defaults and honors SYNC_WRITER_DEVICE', () => {
    expect(writerIdentityForSoloDevice()).toEqual({ kind: 'device', id: 'solo' })
    process.env.SYNC_WRITER_DEVICE = 'laptop-1'
    expect(writerIdentityForSoloDevice()).toEqual({ kind: 'device', id: 'laptop-1' })
  })
})

describe('noteIdForMeshWriter', () => {
  const alice = writerIdentityForUser('alice')

  it('prefixes short ids under the writer path', () => {
    expect(noteIdForMeshWriter('hello', alice)).toBe('writers/user/alice/hello')
    expect(noteIdForMeshWriter('notes/x', alice)).toBe('writers/user/alice/notes/x')
  })

  it('keeps owned writers paths and rejects others', () => {
    expect(noteIdForMeshWriter('writers/user/alice/x', alice)).toBe('writers/user/alice/x')
    expect(() => noteIdForMeshWriter('writers/user/bob/x', alice)).toThrow(WriterPrefixViolationError)
  })
})
