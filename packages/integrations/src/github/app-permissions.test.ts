import { describe, expect, it } from 'vitest'

import {
  evaluateGitHubAppPermissions,
  permissionSatisfies,
  summarizeGitHubAppPermissionChecks,
} from './app-permissions'

describe('github app permissions checklist', () => {
  it('treats write/admin as satisfying read and write requirements', () => {
    expect(permissionSatisfies('read', 'read')).toBe(true)
    expect(permissionSatisfies('write', 'read')).toBe(true)
    expect(permissionSatisfies('read', 'write')).toBe(false)
    expect(permissionSatisfies('write', 'write')).toBe(true)
    expect(permissionSatisfies(undefined, 'read')).toBe(false)
  })

  it('marks required and optional permissions from a GitHub /app payload', () => {
    const checks = evaluateGitHubAppPermissions({
      contents: 'write',
      metadata: 'read',
      members: 'read',
    })

    expect(checks.find(check => check.key === 'contents')?.ok).toBe(true)
    expect(checks.find(check => check.key === 'administration')?.ok).toBe(false)
    expect(checks.find(check => check.key === 'emails')?.ok).toBe(false)

    const summary = summarizeGitHubAppPermissionChecks(checks)
    expect(summary.requiredOk).toBe(true)
    expect(summary.recommendedOk).toBe(false)
    expect(summary.missingRecommended).toEqual(['administration', 'emails'])
  })

  it('fails required checks when contents is missing', () => {
    const checks = evaluateGitHubAppPermissions({
      metadata: 'read',
    })
    const summary = summarizeGitHubAppPermissionChecks(checks)
    expect(summary.requiredOk).toBe(false)
    expect(summary.missingRequired).toContain('contents')
  })
})
