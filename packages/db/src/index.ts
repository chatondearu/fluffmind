// Drizzle ORM schema (Postgres) + Better Auth config: users, sessions, organizations/
// workspaces (Better Auth organization plugin), invitations, and per-workspace Git sync
// bookkeeping. Never stores note content — see the PRD's "founding principle".
//
// Not implemented yet: this package is scaffolded in P0 to lock in the monorepo shape.
// Auth/workspaces land in P2 and have no runtime dependency on it before then — P0 runs
// with an implicit single local workspace (VAULT_PATH env var), no Postgres involved.

export { ac, roles } from './permissions.ts'
export { auth } from './auth.ts'
export { db, getDb } from './client.ts'
export * from './schema/auth.ts'
export * from './schema/workspace.ts'
