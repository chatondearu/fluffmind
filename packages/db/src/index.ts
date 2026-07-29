// Drizzle ORM schema (Postgres) + Better Auth config: users, sessions, organizations/
// workspaces (Better Auth organization plugin), invitations, and per-workspace Git sync
// bookkeeping. Never stores note content — see the PRD's "founding principle".
//
// Client/SSR code that only needs access-control roles must import
// `@fluffmind/db/permissions` — not this barrel — so Vite never inlines `pg`.

export { ac, roles } from './permissions'
export { getAuth } from './auth'
export { db, getDb, getPool } from './client'
export * from './schema/auth'
export * from './schema/workspace'
