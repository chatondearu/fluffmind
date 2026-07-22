/**
 * Global vault write gate for solo / portable / Docker via `VAULT_READONLY`.
 * Only the exact string `true` enables read-only (same style as `AUTH_DISABLED`).
 */

export class VaultReadOnlyError extends Error {
  constructor(message = 'Vault is read-only (VAULT_READONLY=true)') {
    super(message)
    this.name = 'VaultReadOnlyError'
  }
}

export function isVaultReadonly(): boolean {
  return process.env.VAULT_READONLY === 'true'
}

/** Throws VaultReadOnlyError when mutations must be rejected. */
export function assertVaultWritable(): void {
  if (isVaultReadonly()) {
    throw new VaultReadOnlyError()
  }
}
