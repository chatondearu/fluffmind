import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { noteIdForMeshWriter } from './hosted-writer'
import { resolveNoteFilePath } from './note-id'
import { parseWriterIdentity } from './writer-prefix'

// Shared with the Rust daemon (crates/fluffmind-daemon/tests/writer_cases.rs): both sides
// must agree on every id / error, or the Node → Rust swap changes behaviour (ADR-020 §11).
// One row shape for all three tables; each table only fills the inputs it uses.
interface Case { input: string, noteId: string, writer: string, id: string, ok?: unknown, error?: string }
const cases = JSON.parse(readFileSync(
  new URL('../../../../crates/fluffmind-daemon/tests/fixtures/writer-cases.json', import.meta.url),
  'utf-8',
)) as Record<'parseWriterIdentity' | 'noteIdForMeshWriter' | 'resolveNoteFilePath', Case[]>

function check(run: () => unknown, c: Case) {
  if (c.error)
    expect(run).toThrow(expect.objectContaining({ name: `${c.error}Error` }))
  else
    expect(run()).toEqual(c.ok)
}

describe('shared writer case table', () => {
  it.each(cases.parseWriterIdentity)('parseWriterIdentity($input)', (c) => {
    check(() => parseWriterIdentity(c.input), c)
  })

  it.each(cases.noteIdForMeshWriter)('noteIdForMeshWriter($noteId, $writer)', (c) => {
    check(() => noteIdForMeshWriter(c.noteId, parseWriterIdentity(c.writer)), c)
  })

  it.each(cases.resolveNoteFilePath)('resolveNoteFilePath($id)', (c) => {
    check(() => resolveNoteFilePath('/vault', c.id), { ...c, ok: c.ok && resolve('/vault', c.ok as string) })
  })
})
