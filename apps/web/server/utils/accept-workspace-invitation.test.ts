import { afterEach, describe, expect, it, vi } from 'vitest'

import { acceptWorkspaceInvitationWithDeps } from './accept-workspace-invitation'

function stubCreateError() {
  vi.stubGlobal('createError', (options: {
    statusCode: number
    statusMessage: string
    message: string
  }) => Object.assign(new Error(options.message), options))
}

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    findBetterAuthInvitation: vi.fn().mockResolvedValue(null),
    findGithubInvitationByBetterAuthId: vi.fn().mockResolvedValue(null),
    findGithubInvitationById: vi.fn().mockResolvedValue(null),
    userMatchesGithubInvitation: vi.fn().mockResolvedValue(false),
    alignBetterAuthInvitationEmail: vi.fn().mockResolvedValue(undefined),
    acceptBetterAuthInvitation: vi.fn().mockResolvedValue(undefined),
    markGithubInvitationAccepted: vi.fn().mockResolvedValue(undefined),
    acceptGithubOnlyInvitation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const githubInvitation = {
  id: 'github_inv_1',
  organizationId: 'org_1',
  githubLogin: 'octocat',
  githubUserId: '42',
  resolvedEmail: null,
  betterAuthInvitationId: 'ba_inv_1',
  role: 'write',
  status: 'pending',
  expiresAt: new Date('2026-08-01T12:00:00Z'),
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('acceptWorkspaceInvitationWithDeps', () => {
  it('rejects a linked GitHub invitation when only the invitation email matches', async () => {
    stubCreateError()
    const deps = createDeps({
      findBetterAuthInvitation: vi.fn().mockResolvedValue({
        id: 'ba_inv_1',
        email: '42+octocat@users.noreply.github.com',
        status: 'pending',
        expiresAt: new Date('2026-08-01T12:00:00Z'),
      }),
      findGithubInvitationByBetterAuthId: vi.fn().mockResolvedValue(githubInvitation),
      userMatchesGithubInvitation: vi.fn().mockResolvedValue(false),
    })

    await expect(acceptWorkspaceInvitationWithDeps({
      id: 'ba_inv_1',
      userId: 'user_without_github',
      userEmail: '42+octocat@users.noreply.github.com',
      headers: new Headers(),
      now: new Date('2026-07-29T12:00:00Z'),
    }, deps)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Connecte-toi avec le compte GitHub @octocat.',
    })

    expect(deps.acceptBetterAuthInvitation).not.toHaveBeenCalled()
    expect(deps.markGithubInvitationAccepted).not.toHaveBeenCalled()
  })

  it('accepts a linked Better Auth invitation through a GitHub account match', async () => {
    stubCreateError()
    const deps = createDeps({
      findBetterAuthInvitation: vi.fn().mockResolvedValue({
        id: 'ba_inv_1',
        email: '42+octocat@users.noreply.github.com',
        status: 'pending',
        expiresAt: new Date('2026-08-01T12:00:00Z'),
      }),
      findGithubInvitationByBetterAuthId: vi.fn().mockResolvedValue(githubInvitation),
      userMatchesGithubInvitation: vi.fn().mockResolvedValue(true),
    })

    await expect(acceptWorkspaceInvitationWithDeps({
      id: 'ba_inv_1',
      userId: 'user_1',
      userEmail: 'different@example.com',
      headers: new Headers(),
      now: new Date('2026-07-29T12:00:00Z'),
    }, deps)).resolves.toEqual({ ok: true })

    expect(deps.alignBetterAuthInvitationEmail).toHaveBeenCalledWith(
      'ba_inv_1',
      'different@example.com',
    )
    expect(deps.acceptBetterAuthInvitation).toHaveBeenCalledWith('ba_inv_1', expect.any(Headers))
    expect(deps.markGithubInvitationAccepted).toHaveBeenCalledWith('github_inv_1')
  })

  it('keeps accepting an email-only Better Auth invitation by email', async () => {
    stubCreateError()
    const deps = createDeps({
      findBetterAuthInvitation: vi.fn().mockResolvedValue({
        id: 'ba_email_inv_1',
        email: 'invitee@example.com',
        status: 'pending',
        expiresAt: new Date('2026-08-01T12:00:00Z'),
      }),
    })

    await expect(acceptWorkspaceInvitationWithDeps({
      id: 'ba_email_inv_1',
      userId: 'user_1',
      userEmail: 'INVITEE@example.com',
      headers: new Headers(),
      now: new Date('2026-07-29T12:00:00Z'),
    }, deps)).resolves.toEqual({ ok: true })

    expect(deps.acceptBetterAuthInvitation).toHaveBeenCalledWith(
      'ba_email_inv_1',
      expect.any(Headers),
    )
  })

  it('accepts a GitHub-only invitation manually', async () => {
    stubCreateError()
    const deps = createDeps({
      findGithubInvitationById: vi.fn().mockResolvedValue({
        ...githubInvitation,
        betterAuthInvitationId: null,
      }),
      userMatchesGithubInvitation: vi.fn().mockResolvedValue(true),
    })

    await expect(acceptWorkspaceInvitationWithDeps({
      id: 'github_inv_1',
      userId: 'user_1',
      userEmail: 'different@example.com',
      headers: new Headers(),
      now: new Date('2026-07-29T12:00:00Z'),
    }, deps)).resolves.toEqual({ ok: true })

    expect(deps.acceptGithubOnlyInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'github_inv_1' }),
      'user_1',
    )
  })

  it('rejects a mismatched GitHub account with the invited login', async () => {
    stubCreateError()
    const deps = createDeps({
      findGithubInvitationById: vi.fn().mockResolvedValue({
        ...githubInvitation,
        betterAuthInvitationId: null,
      }),
    })

    await expect(acceptWorkspaceInvitationWithDeps({
      id: 'github_inv_1',
      userId: 'user_1',
      userEmail: 'different@example.com',
      headers: new Headers(),
      now: new Date('2026-07-29T12:00:00Z'),
    }, deps)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Connecte-toi avec le compte GitHub @octocat.',
    })
  })
})
