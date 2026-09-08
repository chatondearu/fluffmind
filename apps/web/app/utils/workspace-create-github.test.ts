import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceCreatePostBody,
  buildWorkspaceGithubLinkBody,
  canSubmitWorkspaceCreate,
  defaultGithubModeWhenAvailable,
} from './workspace-create-github'

describe('defaultGithubModeWhenAvailable', () => {
  it('defaults to create when GitHub is available', () => {
    expect(defaultGithubModeWhenAvailable(true)).toBe('create')
  })
  it('defaults to none when unavailable', () => {
    expect(defaultGithubModeWhenAvailable(false)).toBe('none')
  })
})

describe('buildWorkspaceCreatePostBody', () => {
  it('omits createGithubRepo for link and none', () => {
    expect(buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: ['foam'],
      mode: 'link',
      create: { installationId: '1', repoName: 'x', repoPrivate: true },
    })).toEqual({ name: 'Acme', contentRoots: ['foam'] })

    expect(buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: [],
      mode: 'none',
      create: { installationId: '1', repoName: 'x', repoPrivate: true },
    })).toEqual({ name: 'Acme' })
  })

  it('includes createGithubRepo for create mode', () => {
    expect(buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: [],
      mode: 'create',
      create: { installationId: '42', repoName: 'fluff-acme', repoPrivate: false },
    })).toEqual({
      name: 'Acme',
      createGithubRepo: {
        installationId: '42',
        name: 'fluff-acme',
        private: false,
      },
    })
  })

  it('omits empty create repo name so server default applies', () => {
    const body = buildWorkspaceCreatePostBody({
      name: 'Acme',
      contentRoots: [],
      mode: 'create',
      create: { installationId: '42', repoName: '  ', repoPrivate: true },
    })
    expect(body.createGithubRepo).toEqual({
      installationId: '42',
      private: true,
    })
  })
})

describe('buildWorkspaceGithubLinkBody', () => {
  it('builds app link payload with optional contentRoots', () => {
    expect(buildWorkspaceGithubLinkBody({
      workspaceId: 'ws-1',
      contentRoots: ['docs'],
      link: { installationId: '9', repository: 'acme/notes' },
    })).toEqual({
      workspaceId: 'ws-1',
      mode: 'app',
      installationId: '9',
      repository: 'acme/notes',
      contentRoots: ['docs'],
    })
  })
})

describe('canSubmitWorkspaceCreate', () => {
  it('requires installation for create and repository for link', () => {
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'none', installationId: '', repository: '',
    })).toBe(true)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'create', installationId: '', repository: '',
    })).toBe(false)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'create', installationId: '1', repository: '',
    })).toBe(true)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'link', installationId: '1', repository: '',
    })).toBe(false)
    expect(canSubmitWorkspaceCreate({
      name: 'A', mode: 'link', installationId: '1', repository: 'o/r',
    })).toBe(true)
  })
})
