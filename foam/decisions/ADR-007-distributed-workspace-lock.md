# ADR-007 — Distributed workspace lock (Postgres advisory + flock)

- **Status**: accepted
- **Date**: 2026-07-20
- **Tags**: #architecture #data #deployment

## Context

ADR-002 requires a single server-side Git writer per workspace, guarded by a lock.
The P1 implementation used an **in-memory** promise chain, which only works inside one
Node process. Horizontal scale (multiple Nuxt instances sharing a workspace volume)
needs a lock visible to all processes. Solo deployments without Postgres still need
cross-process safety when two processes accidentally share a vault path.

We want **one mental model** for solo-with-Compose and multi-user: when `DATABASE_URL`
is set, use the same backend.

## Decision

1. Introduce `withWorkspaceLock` in `apps/web/server/vault/lock.ts` as the sole
   distributed + local serialization primitive; `withWorkspaceWriteLock` delegates to it.
2. **If `DATABASE_URL` is set:** acquire a **Postgres session-level advisory lock** on a
   dedicated `PoolClient` for the duration of the mutation (including `git commit/push`).
3. **Else:** acquire an exclusive **`flock`** on a lockfile stored **outside** the Git
   working tree when possible (`WORKSPACES_ROOT/.fluffmind-locks/…`).
4. Keep the in-process promise chain **inside** the distributed acquire.
5. On lock wait timeout (`LOCK_WAIT_MS`, default 45000): fail with a typed error mapped
   to HTTP **503**.
6. v1 scale-out assumes a **shared volume** for workspace working copies. Multi-disk /
   Git-only coordination is a follow-up, not a change to this ADR’s lock API.

This **refines** ADR-002’s consequence (“single instance per workspace”) for the shared-volume case; it does not replace ADR-002’s single-writer rule.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Redis / Redlock | New infra; Postgres already required for real deploys |
| Transaction-scoped `pg_advisory_xact_lock` only | Would hold an open transaction across slow Git I/O |
| flock as sole backend | Fragile/insufficient when replicas do not share a filesystem |
| SQLite lock DB for solo | Extra store + migration story; flock + PG covers the path |
| In-memory only (status quo) | Unsafe under multi-instance |

## Consequences

- **Positive**: Safe horizontal scale with shared volume; solo Compose matches multi-user lock path; no Redis.
- **Negative**: Must carefully manage `PoolClient` lifecycle; flock path must never be git-added; dual backend to test.
- **Constraint**: Mutation routes must use `withWorkspaceWriteLock`; do not call `git` outside it. Multi-disk scale-out needs a future ADR/PRD.

## References

- Design: `docs/superpowers/specs/2026-07-20-p7-distributed-workspace-lock-design.md`
- PRD: [[../../prd/PRD-031-p7-distributed-workspace-lock|PRD-031]]
- Code: `apps/web/server/vault/lock.ts`, `write.ts`
- Epic: [#28](https://github.com/chatondearu/fluffmind/issues/28)
- Related: [[ADR-002-server-side-git-sync|ADR-002]], [[../architecture/vault-engine|vault-engine]]
