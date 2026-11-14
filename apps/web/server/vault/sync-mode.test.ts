import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SYNC_MODE, parseSyncMode, syncModeFromEnv } from './sync-mode'

describe('parseSyncMode', () => {
  it('defaults to git-live for missing or invalid values', () => {
    expect(parseSyncMode(undefined)).toBe(DEFAULT_SYNC_MODE)
    expect(parseSyncMode(null)).toBe('git-live')
    expect(parseSyncMode('')).toBe('git-live')
    expect(parseSyncMode('nope')).toBe('git-live')
    expect(parseSyncMode(1)).toBe('git-live')
  })

  it('accepts git-live and mesh-live', () => {
    expect(parseSyncMode('git-live')).toBe('git-live')
    expect(parseSyncMode('mesh-live')).toBe('mesh-live')
    expect(parseSyncMode('MESH-LIVE')).toBe('mesh-live')
    expect(parseSyncMode('mesh')).toBe('mesh-live')
  })
})

describe('syncModeFromEnv', () => {
  afterEach(() => {
    delete process.env.SYNC_MODE
  })

  it('reads SYNC_MODE from the environment', () => {
    expect(syncModeFromEnv()).toBe('git-live')
    process.env.SYNC_MODE = 'mesh-live'
    expect(syncModeFromEnv()).toBe('mesh-live')
  })
})
