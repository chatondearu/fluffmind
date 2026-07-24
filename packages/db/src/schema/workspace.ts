import { boolean, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

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
