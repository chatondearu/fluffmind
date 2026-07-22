import { afterEach, describe, expect, it } from 'vitest'

import { VaultReadOnlyError, assertVaultWritable, isVaultReadonly } from './readonly'

describe('isVaultReadonly', () => {
  afterEach(() => {
    delete process.env.VAULT_READONLY
  })

  it('is false when unset', () => {
    delete process.env.VAULT_READONLY
    expect(isVaultReadonly()).toBe(false)
  })

  it('is true only for exact string "true"', () => {
    process.env.VAULT_READONLY = 'true'
    expect(isVaultReadonly()).toBe(true)
  })

  it('is false for other truthy-looking values', () => {
    for (const value of ['TRUE', '1', 'yes', 'false', '']) {
      process.env.VAULT_READONLY = value
      expect(isVaultReadonly()).toBe(false)
    }
  })
})

describe('assertVaultWritable', () => {
  afterEach(() => {
    delete process.env.VAULT_READONLY
  })

  it('does not throw when writable', () => {
    expect(() => assertVaultWritable()).not.toThrow()
  })

  it('throws VaultReadOnlyError when read-only', () => {
    process.env.VAULT_READONLY = 'true'
    expect(() => assertVaultWritable()).toThrow(VaultReadOnlyError)
  })
})
