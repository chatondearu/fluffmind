import { describe, expect, it } from 'vitest'
import {
  assertNoteIdWritableByWriter,
  parseWriterIdentity,
  sanitizeWriterId,
  writerPathPrefix,
  WriterPrefixViolationError,
  InvalidWriterIdentityError,
} from './writer-prefix'

describe('parseWriterIdentity', () => {
  it('parses kind:id', () => {
    expect(parseWriterIdentity('user:alice')).toEqual({ kind: 'user', id: 'alice' })
    expect(parseWriterIdentity('agent:bot-1')).toEqual({ kind: 'agent', id: 'bot-1' })
    expect(parseWriterIdentity('device:laptop_01')).toEqual({ kind: 'device', id: 'laptop_01' })
  })

  it('rejects bad identities', () => {
    expect(() => parseWriterIdentity('')).toThrow(InvalidWriterIdentityError)
    expect(() => parseWriterIdentity('user')).toThrow(InvalidWriterIdentityError)
    expect(() => parseWriterIdentity('foo:bar')).toThrow(InvalidWriterIdentityError)
    expect(() => parseWriterIdentity('user:a/b')).toThrow(InvalidWriterIdentityError)
  })
})

describe('writerPathPrefix', () => {
  it('builds writers/<kind>/<id>', () => {
    expect(writerPathPrefix({ kind: 'user', id: 'alice' })).toBe('writers/user/alice')
  })
})

describe('assertNoteIdWritableByWriter', () => {
  const writer = { kind: 'user' as const, id: 'alice' }

  it('allows notes under the writer prefix', () => {
    expect(() => assertNoteIdWritableByWriter('writers/user/alice/draft', writer)).not.toThrow()
    expect(() => assertNoteIdWritableByWriter('writers/user/alice', writer)).not.toThrow()
  })

  it('rejects canonical and other writers paths', () => {
    expect(() => assertNoteIdWritableByWriter('index', writer)).toThrow(WriterPrefixViolationError)
    expect(() => assertNoteIdWritableByWriter('writers/user/bob/x', writer)).toThrow(
      WriterPrefixViolationError,
    )
    expect(() => assertNoteIdWritableByWriter('writers/agent/alice/x', writer)).toThrow(
      WriterPrefixViolationError,
    )
  })

  it('sanitizeWriterId rejects empty', () => {
    expect(() => sanitizeWriterId('')).toThrow(InvalidWriterIdentityError)
  })
})
