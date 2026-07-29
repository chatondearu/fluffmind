export type GitHubAppPermissionScope = 'repository' | 'account'

export type GitHubAppPermissionLevel = 'read' | 'write'

export interface GitHubAppPermissionRequirement {
  /** Key as returned by `GET /app` → `permissions`. */
  key: string
  label: string
  scope: GitHubAppPermissionScope
  requiredLevel: GitHubAppPermissionLevel
  /** When false, missing permission is a warning, not a blocker. */
  required: boolean
  why: string
}

/**
 * Permissions Fluffmind expects on the self-hosted GitHub App.
 * Keep in sync with `apps/docs/guide/github-app-setup.md`.
 */
export const GITHUB_APP_PERMISSION_REQUIREMENTS: readonly GitHubAppPermissionRequirement[] = [
  {
    key: 'contents',
    label: 'Contents',
    scope: 'repository',
    requiredLevel: 'write',
    required: true,
    why: 'Clone, commit, and push the vault',
  },
  {
    key: 'metadata',
    label: 'Metadata',
    scope: 'repository',
    requiredLevel: 'read',
    required: true,
    why: 'Required by GitHub for all Apps',
  },
  {
    key: 'members',
    label: 'Members',
    scope: 'repository',
    requiredLevel: 'read',
    required: true,
    why: 'Hybrid collaborator → workspace role sync',
  },
  {
    key: 'administration',
    label: 'Administration',
    scope: 'repository',
    requiredLevel: 'write',
    required: false,
    why: 'Create GitHub repositories when creating a workspace',
  },
  {
    key: 'emails',
    label: 'Email addresses',
    scope: 'account',
    requiredLevel: 'read',
    required: false,
    why: 'GitHub login with a real email (noreply fallback still works without it)',
  },
] as const

export interface GitHubAppPermissionCheck extends GitHubAppPermissionRequirement {
  ok: boolean
  actual: string | null
}

function levelRank(level: string | null | undefined): number {
  if (level === 'admin' || level === 'write')
    return 2
  if (level === 'read')
    return 1
  return 0
}

export function permissionSatisfies(
  actual: string | null | undefined,
  required: GitHubAppPermissionLevel,
): boolean {
  const need = required === 'write' ? 2 : 1
  return levelRank(actual) >= need
}

export function evaluateGitHubAppPermissions(
  permissions: Record<string, string> | null | undefined,
): GitHubAppPermissionCheck[] {
  return GITHUB_APP_PERMISSION_REQUIREMENTS.map((requirement) => {
    const actual = permissions?.[requirement.key] ?? null
    return {
      ...requirement,
      actual,
      ok: permissionSatisfies(actual, requirement.requiredLevel),
    }
  })
}

export function summarizeGitHubAppPermissionChecks(checks: GitHubAppPermissionCheck[]): {
  requiredOk: boolean
  recommendedOk: boolean
  missingRequired: string[]
  missingRecommended: string[]
} {
  const missingRequired = checks.filter(check => check.required && !check.ok).map(check => check.key)
  const missingRecommended = checks.filter(check => !check.required && !check.ok).map(check => check.key)
  return {
    requiredOk: missingRequired.length === 0,
    recommendedOk: missingRecommended.length === 0,
    missingRequired,
    missingRecommended,
  }
}
