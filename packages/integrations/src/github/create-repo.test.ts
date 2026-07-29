import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubRepository, GithubApiError } from './create-repo.ts'

describe('createGithubRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to /orgs/{org}/repos for Organization', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'fluff-docs',
        owner: { login: 'acme' },
        html_url: 'https://github.com/acme/fluff-docs',
        clone_url: 'https://github.com/acme/fluff-docs.git',
      }),
    })

    await expect(
      createGithubRepository({
        token: 'ghs_x',
        accountLogin: 'acme',
        accountType: 'Organization',
        name: 'fluff-docs',
        private: true,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({
      owner: 'acme',
      repo: 'fluff-docs',
      htmlUrl: 'https://github.com/acme/fluff-docs',
      cloneUrl: 'https://github.com/acme/fluff-docs.git',
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/orgs/acme/repos',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ghs_x',
          Accept: 'application/vnd.github+json',
        }),
        body: JSON.stringify({
          name: 'fluff-docs',
          private: true,
          // Empty remote: avoids README vs local welcome.md rebase conflicts.
          auto_init: false,
        }),
      }),
    )
  })

  it('POSTs to /user/repos for User', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'fluff-solo',
        owner: { login: 'alice' },
        html_url: 'https://github.com/alice/fluff-solo',
        clone_url: 'https://github.com/alice/fluff-solo.git',
      }),
    })

    await createGithubRepository({
      token: 'ghs_x',
      accountLogin: 'alice',
      accountType: 'User',
      name: 'fluff-solo',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.github.com/user/repos')
  })

  it('throws GithubApiError on non-OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Repository creation failed.' }),
    })

    await expect(
      createGithubRepository({
        token: 'ghs_x',
        accountLogin: 'acme',
        accountType: 'Organization',
        name: 'taken',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      status: 422,
      githubMessage: 'Repository creation failed.',
    })
    await expect(
      createGithubRepository({
        token: 'ghs_x',
        accountLogin: 'acme',
        accountType: 'Organization',
        name: 'taken',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(GithubApiError)
  })
})
