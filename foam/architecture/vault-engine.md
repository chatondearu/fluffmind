# Vault engine & Git sync

#architecture #data

## Read path (P0)

- Parser, wikilink extraction, in-memory index, read-only Nitro routes.
- Code: `apps/web/server/vault/` (`parser.ts`, `reader.ts`, `index.ts`).

## Write path (P1+)

All mutations go through `writeToWorkspace` with per-workspace locking — see
[[../decisions/ADR-002-server-side-git-sync|ADR-002]] and
[[../decisions/ADR-003-simple-git-binary|ADR-003]].

P2 adds Postgres-backed workspace resolution (`workspace_config`) while keeping note
content on disk only — [[../decisions/ADR-006-better-auth-workspaces|ADR-006]].
