import { boolean, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const memberSyncSource = pgEnum('member_sync_source', ['github', 'manual'])

export const githubLinkAuthMode = pgEnum('github_link_auth_mode', ['app', 'pat'])

export const githubAppInstallation = pgTable('github_app_installation', {
  id: text('id').primaryKey(),
  installationId: text('installation_id').notNull().unique(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const workspaceConfig = pgTable('workspace_config', {
  organizationId: text('organization_id').primaryKey(),
  vaultPath: text('vault_path').notNull(),
  gitRemoteUrl: text('git_remote_url'),
  gitBranch: text('git_branch').notNull().default('main'),
  agentEnabled: boolean('agent_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const mcpTokenScope = pgEnum('mcp_token_scope', ['read', 'write'])

export const workspaceAgentToken = pgTable(
  'workspace_agent_token',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    scope: mcpTokenScope('scope').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    index('workspace_agent_token_organizationId_idx').on(table.organizationId),
    index('workspace_agent_token_tokenHash_idx').on(table.tokenHash),
  ],
)

export const workspaceGithubLink = pgTable('workspace_github_link', {
  organizationId: text('organization_id').primaryKey(),
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  authMode: githubLinkAuthMode('auth_mode').notNull().default('pat'),
  installationId: text('installation_id'),
  syncToken: text('sync_token'),
  lastSyncedAt: timestamp('last_synced_at'),
})

export const memberSyncMeta = pgTable('member_sync_meta', {
  memberId: text('member_id').primaryKey(),
  source: memberSyncSource('source').notNull(),
  localOverride: boolean('local_override').notNull().default(false),
})

export const githubInvitation = pgTable(
  'github_invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    githubLogin: text('github_login').notNull(),
    githubUserId: text('github_user_id'),
    resolvedEmail: text('resolved_email'),
    betterAuthInvitationId: text('better_auth_invitation_id'),
    role: text('role').notNull(),
    status: text('status').notNull().default('pending'),
    inviterId: text('inviter_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('github_invitation_organizationId_idx').on(table.organizationId),
    index('github_invitation_githubLogin_idx').on(table.githubLogin),
    index('github_invitation_betterAuthInvitationId_idx').on(table.betterAuthInvitationId),
  ],
)
