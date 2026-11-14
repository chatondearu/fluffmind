/**
 * Portable local daemon facade (ADR-016): mesh-live file writes, no Git.
 * Runnable entry: `scripts/fluffmind-daemon.mjs`.
 */
export {
  writeNoteLocal,
  parseWriterIdentity,
  writerPathPrefix,
  noteIdForMeshWriter,
  resolveNoteFilePath,
  InvalidWriterIdentityError,
  WriterPrefixViolationError,
  InvalidNoteIdError,
} from './write-local.mjs'

export { createDaemonServer } from './create-server.mjs'
