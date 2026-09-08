export type WorkspaceCreateGithubMode = 'none' | 'create' | 'link'

export interface WorkspaceCreateGithubCreateFields {
  installationId: string
  repoName: string
  repoPrivate: boolean
}

export interface WorkspaceCreateGithubLinkFields {
  installationId: string
  repository: string
}

export function defaultGithubModeWhenAvailable(githubAvailable: boolean): WorkspaceCreateGithubMode {
  return githubAvailable ? 'create' : 'none'
}

export function buildWorkspaceCreatePostBody(input: {
  name: string
  contentRoots: string[]
  mode: WorkspaceCreateGithubMode
  create: WorkspaceCreateGithubCreateFields
}): Record<string, unknown> {
  const body: Record<string, unknown> = { name: input.name }
  if (input.contentRoots.length)
    body.contentRoots = input.contentRoots

  if (input.mode === 'create' && input.create.installationId) {
    const trimmedName = input.create.repoName.trim()
    body.createGithubRepo = {
      installationId: input.create.installationId,
      private: input.create.repoPrivate,
      ...(trimmedName ? { name: trimmedName } : {}),
    }
  }
  return body
}

export function buildWorkspaceGithubLinkBody(input: {
  workspaceId: string
  contentRoots: string[]
  link: WorkspaceCreateGithubLinkFields
}) {
  const payload: {
    workspaceId: string
    mode: 'app'
    installationId: string
    repository: string
    contentRoots?: string[]
  } = {
    workspaceId: input.workspaceId,
    mode: 'app',
    installationId: input.link.installationId,
    repository: input.link.repository.trim(),
  }
  if (input.contentRoots.length)
    payload.contentRoots = input.contentRoots
  return payload
}

export function canSubmitWorkspaceCreate(input: {
  name: string
  mode: WorkspaceCreateGithubMode
  installationId: string
  repository: string
}): boolean {
  if (!input.name.trim())
    return false
  if (input.mode === 'create')
    return Boolean(input.installationId)
  if (input.mode === 'link')
    return Boolean(input.installationId && input.repository.trim())
  return true
}
