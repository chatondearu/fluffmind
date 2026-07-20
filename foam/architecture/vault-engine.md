# Vault engine & Git sync

#architecture #data

## Read path (P0)

- Parser, wikilink extraction, in-memory index, read-only Nitro routes.
- Code: `apps/web/server/vault/` (`parser.ts`, `reader.ts`, `index.ts`).

## Write path (P1+)

All mutations go through `writeToWorkspace` (and related helpers in `mutations.ts`) with
**per-workspace locking** — see [[../decisions/ADR-002-server-side-git-sync|ADR-002]] and
[[../decisions/ADR-003-simple-git-binary|ADR-003]].

P2 adds Postgres-backed workspace resolution (`workspace_config`) while keeping note
content on disk only — [[../decisions/ADR-006-better-auth-workspaces|ADR-006]].

## Concurrency lock (current vs P7)

### What exists today

Implementation: `withWorkspaceLock` in `apps/web/server/vault/write.ts`.

- A process-local `Map<workspaceId, Promise>` chains mutations so writes to the **same
  workspace** are strictly sequential inside **one Node process**.
- A failed write never poisons the chain (`.then(run, run)` + settle to `undefined`).
- Same lock wraps note writes, renames, and deletes (`withWorkspaceWriteLock`).
- Commit always happens **before** push; a rejected push / rebase conflict leaves the
  local commit intact and surfaces 409 — no silent data loss.

### What it does *not* cover

| Scenario | Risk today |
| -------- | ---------- |
| Two tabs / MCP agents / HTTP writers hitting **one** server instance | Safe — serialized by the in-memory chain |
| Two **server instances** (replicas, rolling deploy, Coolify scale) sharing the same workspace working copy (NFS/volume) or the same Git remote | **Unsafe** — each process has its own `Map`; concurrent `git` ops can interleave |
| Horizontal scale-out with sticky sessions but shared disk | Still unsafe if two pods write the same workspace |

### Why this was deferred (MVP)

Self-host MVP assumes **one Nuxt process owns a given workspace at a time** (single
container / single node). That matches Coolify solo deploys and local `pnpm dev`.
Proving multi-replica need was deliberately left to P7.

### P7a direction (approved — implementing)

See [[../decisions/ADR-007-distributed-workspace-lock|ADR-007]] and
[[../../prd/PRD-031-p7-distributed-workspace-lock|PRD-031]]:

1. **Postgres session advisory locks** when `DATABASE_URL` is set (dedicated `PoolClient`).
2. **`flock` fallback** when no database (lockfiles outside the Git work tree when possible).
3. Keep the in-process promise chain **inside** the distributed acquire.
4. Wait ~45s then HTTP 503. v1 assumes **shared volume** for working copies.

Multi-disk / Git-remote-only coordination and static publishing remain later slices of
epic [#28](https://github.com/chatondearu/fluffmind/issues/28)
([P7 — Stretch](https://github.com/chatondearu/fluffmind/milestone/8)).

Design archive: `docs/superpowers/specs/2026-07-20-p7-distributed-workspace-lock-design.md`.
