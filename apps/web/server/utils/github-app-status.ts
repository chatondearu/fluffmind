import {
  createAppJwt,
  evaluateGitHubAppPermissions,
  summarizeGitHubAppPermissionChecks,
  type GitHubAppPermissionCheck,
} from '@fluffmind/integrations'

import { getGitHubAppCredentials, isGitHubAppConfigured } from './github-credentials'

export interface GitHubAppStatusResponse {
  configured: boolean
  slugConfigured: boolean
  webhookSecretConfigured: boolean
  oauthLoginConfigured: boolean
  permissions: Record<string, string> | null
  checks: GitHubAppPermissionCheck[]
  requiredOk: boolean
  recommendedOk: boolean
  permissionsError: string | null
}

interface GitHubAppApiPayload {
  permissions?: Record<string, string>
  slug?: string
}

function envFlags() {
  return {
    slugConfigured: Boolean(process.env.GITHUB_APP_SLUG?.trim()),
    webhookSecretConfigured: Boolean(
      process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || process.env.GITHUB_WEBHOOK_SECRET?.trim(),
    ),
    oauthLoginConfigured: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
    ),
  }
}

export async function fetchGitHubAppStatus(): Promise<GitHubAppStatusResponse> {
  const flags = envFlags()
  const configured = isGitHubAppConfigured()

  if (!configured) {
    const checks = evaluateGitHubAppPermissions(null)
    return {
      configured: false,
      ...flags,
      permissions: null,
      checks,
      requiredOk: false,
      recommendedOk: false,
      permissionsError: null,
    }
  }

  const credentials = getGitHubAppCredentials()
  if (!credentials) {
    const checks = evaluateGitHubAppPermissions(null)
    return {
      configured: false,
      ...flags,
      permissions: null,
      checks,
      requiredOk: false,
      recommendedOk: false,
      permissionsError: null,
    }
  }

  try {
    const { token } = await createAppJwt(credentials)
    const response = await fetch('https://api.github.com/app', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'fluffmind',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      const body = await response.text()
      const checks = evaluateGitHubAppPermissions(null)
      return {
        configured: true,
        ...flags,
        permissions: null,
        checks,
        requiredOk: false,
        recommendedOk: false,
        permissionsError: `GitHub /app returned HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
      }
    }

    const payload = await response.json() as GitHubAppApiPayload
    const permissions = payload.permissions ?? null
    const checks = evaluateGitHubAppPermissions(permissions)
    const summary = summarizeGitHubAppPermissionChecks(checks)

    return {
      configured: true,
      ...flags,
      permissions,
      checks,
      requiredOk: summary.requiredOk,
      recommendedOk: summary.recommendedOk,
      permissionsError: null,
    }
  }
  catch (error) {
    const checks = evaluateGitHubAppPermissions(null)
    const message = error instanceof Error ? error.message : 'Failed to query GitHub App permissions.'
    return {
      configured: true,
      ...flags,
      permissions: null,
      checks,
      requiredOk: false,
      recommendedOk: false,
      permissionsError: message,
    }
  }
}
