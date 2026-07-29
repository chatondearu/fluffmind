import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  chooseInvitationEmail,
  createWorkspaceInvitationWithDeps,
  matchesGithubInvitationIdentity,
  normalizeWorkspaceInvitationInput,
} from './github-invitations'

const invitation = {
  githubLogin: 'octocat',
  githubUserId: '42',
  resolvedEmail: 'octocat@example.com',
  betterAuthInvitationId: 'inv_1',
}

function stubCreateError() {
  vi.stubGlobal('createError', (options: {
    statusCode: number
    statusMessage: string
    message: string
  }) => Object.assign(new Error(options.message), options))
}

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    resolveCredentials: vi.fn().mockResolvedValue({ token: 'token' }),
    resolveUser: vi.fn().mockResolvedValue({
      id: '42',
      login: 'octocat',
      email: null,
      avatarUrl: null,
    }),
    isAlreadyMember: vi.fn().mockResolvedValue(false),
    findPendingInvitation: vi.fn().mockResolvedValue(null),
    inviteMember: vi.fn().mockResolvedValue({
      id: 'inv_1',
      expiresAt: new Date('2026-08-01T12:00:00Z'),
    }),
    insertGithubInvitation: vi.fn().mockResolvedValue(undefined),
    cancelInvitation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('matchesGithubInvitationIdentity', () => {
  it('matches a linked GitHub account by login', () => {
    expect(matchesGithubInvitationIdentity({
      githubAccountIds: ['OctoCat'],
    }, invitation)).toBe(true)
  })

  it('matches a linked GitHub account by GitHub user id', () => {
    expect(matchesGithubInvitationIdentity({
      githubAccountIds: ['42'],
    }, invitation)).toBe(true)
  })

  it('does not match a GitHub invitation without a linked GitHub account', () => {
    expect(matchesGithubInvitationIdentity({
      githubAccountIds: [],
    }, invitation)).toBe(false)
  })

  it('returns false when the linked GitHub identity does not match', () => {
    expect(matchesGithubInvitationIdentity({
      githubAccountIds: ['different-user'],
    }, invitation)).toBe(false)
  })
})

describe('invitation input helpers', () => {
  it('normalizes inputs and classifies invitation kinds', () => {
    expect(normalizeWorkspaceInvitationInput(' Invitee@Example.com ', ' @OctoCat ')).toEqual({
      email: 'invitee@example.com',
      githubLogin: 'octocat',
      kind: 'github_and_email',
    })
    expect(normalizeWorkspaceInvitationInput('invitee@example.com', null).kind).toBe('email')
    expect(normalizeWorkspaceInvitationInput(null, 'octocat').kind).toBe('github')
  })

  it('prefers explicit then resolved then unguessable invite email', () => {
    expect(chooseInvitationEmail('explicit@example.com', {
      id: '42',
      login: 'octocat',
      email: 'resolved@example.com',
    })).toBe('explicit@example.com')
    expect(chooseInvitationEmail(null, {
      id: '42',
      login: 'octocat',
      email: 'resolved@example.com',
    })).toBe('resolved@example.com')
    const inviteEmail = chooseInvitationEmail(null, {
      id: '42',
      login: 'octocat',
      email: null,
    })
    expect(inviteEmail).toMatch(
      /^gh-invite-[0-9a-f-]+@users\.noreply\.github\.com$/,
    )
    expect(inviteEmail).not.toBe('42+octocat@users.noreply.github.com')
  })
})

describe('createWorkspaceInvitationWithDeps', () => {
  it('creates and links a GitHub invitation to the Better Auth id', async () => {
    stubCreateError()
    const deps = createDeps()

    const result = await createWorkspaceInvitationWithDeps({
      organizationId: 'org_1',
      inviterId: 'user_1',
      role: 'write',
      githubLogin: '@OctoCat',
      headers: new Headers(),
    }, deps)

    expect(result).toMatchObject({
      invitationId: 'inv_1',
      url: '/accept-invitation/inv_1',
      kind: 'github',
      githubLogin: 'octocat',
    })
    expect(result.email).toMatch(
      /^gh-invite-[0-9a-f-]+@users\.noreply\.github\.com$/,
    )
    expect(result.email).not.toBe('42+octocat@users.noreply.github.com')

    expect(deps.inviteMember).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        email: result.email,
        role: 'write',
        organizationId: 'org_1',
      },
    })
    expect(deps.insertGithubInvitation).toHaveBeenCalledWith(expect.objectContaining({
      betterAuthInvitationId: 'inv_1',
      githubLogin: 'octocat',
      githubUserId: '42',
      resolvedEmail: result.email,
    }))
  })

  it('reuses a duplicate pending invitation', async () => {
    stubCreateError()
    const deps = createDeps({
      findPendingInvitation: vi.fn().mockResolvedValue({ invitationId: 'inv_existing' }),
    })

    await expect(createWorkspaceInvitationWithDeps({
      organizationId: 'org_1',
      inviterId: 'user_1',
      role: 'read',
      githubLogin: 'octocat',
      headers: new Headers(),
    }, deps)).resolves.toMatchObject({
      invitationId: 'inv_existing',
      url: '/accept-invitation/inv_existing',
    })

    expect(deps.inviteMember).not.toHaveBeenCalled()
    expect(deps.insertGithubInvitation).not.toHaveBeenCalled()
  })

  it('cancels the Better Auth invitation when GitHub metadata insertion fails', async () => {
    stubCreateError()
    const insertError = new Error('metadata insert failed')
    const deps = createDeps({
      insertGithubInvitation: vi.fn().mockRejectedValue(insertError),
    })

    await expect(createWorkspaceInvitationWithDeps({
      organizationId: 'org_1',
      inviterId: 'user_1',
      role: 'read',
      githubLogin: 'octocat',
      headers: new Headers(),
    }, deps)).rejects.toBe(insertError)

    expect(deps.cancelInvitation).toHaveBeenCalledWith('inv_1')
  })

  it('rejects an existing workspace member', async () => {
    stubCreateError()
    const deps = createDeps({
      isAlreadyMember: vi.fn().mockResolvedValue(true),
    })

    await expect(createWorkspaceInvitationWithDeps({
      organizationId: 'org_1',
      inviterId: 'user_1',
      role: 'read',
      githubLogin: 'octocat',
      headers: new Headers(),
    }, deps)).rejects.toMatchObject({ statusCode: 409 })
  })
})
