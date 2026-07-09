import { describe, expect, it } from 'vitest'

import { mapGitHubPermission } from './collaborators.ts'

describe('mapGitHubPermission', () => {
  it('maps pull to read', () => {
    expect(mapGitHubPermission('pull')).toBe('read')
  })

  it('maps push to write', () => {
    expect(mapGitHubPermission('push')).toBe('write')
  })

  it('maps maintain to write', () => {
    expect(mapGitHubPermission('maintain')).toBe('write')
  })

  it('maps admin to owner', () => {
    expect(mapGitHubPermission('admin')).toBe('owner')
  })
})
