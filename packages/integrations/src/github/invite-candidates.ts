import { fetchCollaborators } from './collaborators'
import { fetchOrgMembers } from './org-members'

export interface GitHubInviteCandidate {
  login: string
  id: string
  avatarUrl: string | null
  source: 'org_member' | 'collaborator'
}

export async function listGitHubInviteCandidates(input: {
  token: string
  installationAccountLogin: string
  installationAccountType: string
  repoOwner: string | null
  repoName: string | null
}): Promise<GitHubInviteCandidate[]> {
  if (input.installationAccountType === 'Organization')
    return fetchOrgMembers(input.token, input.installationAccountLogin)

  if (input.repoOwner && input.repoName) {
    const collaborators = await fetchCollaborators(input.token, input.repoOwner, input.repoName)
    return collaborators.map(collaborator => ({
      login: collaborator.login,
      id: collaborator.id ?? '',
      avatarUrl: collaborator.avatarUrl ?? null,
      source: 'collaborator' as const,
    }))
  }

  return []
}

export { fetchOrgMembers } from './org-members'
