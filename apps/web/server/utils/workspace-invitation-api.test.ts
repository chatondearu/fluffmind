import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  filterGitHubInviteCandidates,
  parseWorkspaceInvitationBody,
} from './workspace-invitation-api'

beforeEach(() => {
  vi.stubGlobal('createError', (options: {
    statusCode: number
    statusMessage: string
    message: string
  }) => Object.assign(new Error(options.message), options))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseWorkspaceInvitationBody', () => {
  it('accepts a valid invitation target and role', () => {
    expect(parseWorkspaceInvitationBody({
      email: ' Invitee@Example.com ',
      githubLogin: ' @OctoCat ',
      role: 'write',
    })).toEqual({
      email: 'Invitee@Example.com',
      githubLogin: '@OctoCat',
      role: 'write',
    })
  })

  it('rejects payloads without an email or GitHub login', () => {
    expect(() => parseWorkspaceInvitationBody({ role: 'read' })).toThrowError(
      'An email address or GitHub login is required.',
    )
  })

  it('rejects unknown roles', () => {
    expect(() => parseWorkspaceInvitationBody({
      email: 'invitee@example.com',
      role: 'admin',
    })).toThrowError('Role must be read, write, or owner.')
  })
})

describe('filterGitHubInviteCandidates', () => {
  it('excludes candidates by GitHub id or normalized login', () => {
    const candidates = [
      { login: 'Alice', id: '10', avatarUrl: null, source: 'org_member' as const },
      { login: 'bob', id: '20', avatarUrl: null, source: 'org_member' as const },
      { login: 'carol', id: '30', avatarUrl: null, source: 'org_member' as const },
    ]

    expect(filterGitHubInviteCandidates(candidates, ['10', 'BOB'])).toEqual([
      candidates[2],
    ])
  })
})
