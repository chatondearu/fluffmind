import {
  account,
  getDb,
  githubAppInstallation,
  githubInvitation,
  member,
  workspaceGithubLink,
} from '@fluffmind/db'
import { listGitHubInviteCandidates } from '@fluffmind/integrations'
import { and, eq, gt } from 'drizzle-orm'

import { resolveWorkspaceGitHubCredentials } from '../../../utils/github-credentials'
import {
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'
import { filterGitHubInviteCandidates } from '../../../utils/workspace-invitation-api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const workspaceId = parseWorkspaceId(query.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const credentials = await resolveWorkspaceGitHubCredentials(authority.workspaceId)
  if (!credentials)
    return { candidates: [], source: null }

  const db = getDb()
  const [installation] = await db
    .select({
      accountLogin: githubAppInstallation.accountLogin,
      accountType: githubAppInstallation.accountType,
    })
    .from(workspaceGithubLink)
    .leftJoin(
      githubAppInstallation,
      eq(githubAppInstallation.installationId, workspaceGithubLink.installationId),
    )
    .where(eq(workspaceGithubLink.organizationId, authority.workspaceId))
    .limit(1)

  const installationAccountType = installation?.accountType ?? 'User'
  const [candidates, memberAccounts, pendingInvitations] = await Promise.all([
    listGitHubInviteCandidates({
      token: credentials.token,
      installationAccountLogin: installation?.accountLogin ?? credentials.owner,
      installationAccountType,
      repoOwner: credentials.owner,
      repoName: credentials.repo,
    }),
    db
      .select({ accountId: account.accountId })
      .from(member)
      .innerJoin(account, eq(account.userId, member.userId))
      .where(and(
        eq(member.organizationId, authority.workspaceId),
        eq(account.providerId, 'github'),
      )),
    db
      .select({ githubLogin: githubInvitation.githubLogin })
      .from(githubInvitation)
      .where(and(
        eq(githubInvitation.organizationId, authority.workspaceId),
        eq(githubInvitation.status, 'pending'),
        gt(githubInvitation.expiresAt, new Date()),
      )),
  ])
  const unavailableIdentities = [
    ...memberAccounts.map(row => row.accountId),
    ...pendingInvitations.map(row => row.githubLogin),
  ]

  return {
    candidates: filterGitHubInviteCandidates(candidates, unavailableIdentities),
    source: installationAccountType === 'Organization'
      ? 'org_member' as const
      : 'collaborator' as const,
  }
})
