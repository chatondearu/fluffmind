import { boolean, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const memberSyncSource = pgEnum('member_sync_source', ['github', 'manual'])

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
  syncToken: text('sync_token').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
})

export const memberSyncMeta = pgTable('member_sync_meta', {
  memberId: text('member_id').primaryKey(),
  source: memberSyncSource('source').notNull(),
  localOverride: boolean('local_override').notNull().default(false),
})
