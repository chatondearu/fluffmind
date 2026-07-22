import { VaultConflictError } from '../vault/mutations'
import { VaultReadOnlyError } from '../vault/readonly'
import { GitConflictError, InvalidNoteIdError, WorkspaceLockTimeoutError } from '../vault/write'

/**
 * Maps vault mutation errors to HTTP errors. Prefer this in note/folder write routes.
 * Passes through existing H3 errors (e.g. 409 note already exists).
 */
export function rethrowVaultMutationError(error: unknown): never {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    throw error
  }
  if (error instanceof VaultReadOnlyError) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Vault read-only',
      message: error.message,
    })
  }
  if (error instanceof WorkspaceLockTimeoutError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Workspace busy',
      message: error.message,
    })
  }
  if (error instanceof GitConflictError) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: error.message,
    })
  }
  if (error instanceof VaultConflictError) {
    throw createError({
      statusCode: 409,
      statusMessage: error.message,
    })
  }
  if (error instanceof InvalidNoteIdError) {
    throw createError({
      statusCode: 400,
      statusMessage: error.message,
    })
  }
  throw error
}
