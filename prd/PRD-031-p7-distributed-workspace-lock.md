# PRD-031 — P7a Distributed workspace lock

- **Status**: approved
- **Date**: 2026-07-20
- **Tags**: #architecture #data #deployment
- **GitHub**: Epic [#28](https://github.com/chatondearu/fluffmind/issues/28) · Milestone [P7 — Stretch](https://github.com/chatondearu/fluffmind/milestone/8)
- **Depends on**: ADR-002 (server-side Git), P2 Postgres (`DATABASE_URL`)
- **Design spec**: `docs/superpowers/specs/2026-07-20-p7-distributed-workspace-lock-design.md`
- **Plan**: [[../plans/PLAN-031-p7-distributed-workspace-lock|PLAN-031]]
- **ADR**: [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]]

## Problem

The MVP workspace lock is **in-memory per Node process**. Concurrent writes from one
instance are safe; **multiple server replicas** sharing a workspace working copy are
not. Operators who scale Coolify/Docker horizontally risk interleaved `git` operations.

Enabling auth / multi-user should not change lock guarantees when Postgres is already
present (Compose always includes Postgres, including `AUTH_DISABLED`).

## Goals

- [ ] Cross-process serialization of vault mutations per `workspaceId` when `DATABASE_URL` is set (Postgres session advisory locks)
- [ ] Fallback serialization via **flock** when no database URL (bare local dev)
- [ ] Keep `withWorkspaceWriteLock` as the single entry point for write/rename/delete
- [ ] Wait up to ~45s (`LOCK_WAIT_MS`); then **503** workspace busy
- [ ] Document env + operator assumption: v1 scale-out = **shared volume** for working copies
- [ ] Automated tests covering timeout + dual-backend selection; concurrent smoke where practical

## Non-goals

- Static publishing / Quartz-style export (separate PRD under #28)
- Multi-disk replicas without shared volume (P7b follow-up)
- Redis
- Real-time collaborative editing / CRDT
- Distributed vault **read** index (invalidation remains local; single writer suffices on shared volume)

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Operator | Scales web service to 2 replicas with shared `WORKSPACES_ROOT`; notes keep saving without corruption |
| Solo self-hoster | Single container + Postgres: same advisory lock path as multi-user |
| Local hacker | `pnpm` without DB: flock prevents two accidental processes from clobbering the vault |
| Developer | Autosave waits briefly under contention instead of failing immediately |

## Requirements

### Functional

- [ ] Extract lock to `apps/web/server/vault/lock.ts` with Postgres + flock backends
- [ ] Derive stable advisory lock key from `workspaceId`
- [ ] Hold advisory lock on a dedicated `PoolClient` for the whole critical section
- [ ] Place flock files **outside** the Git work tree when possible (see design spec)
- [ ] Map `WorkspaceLockTimeoutError` → HTTP 503 on note/folder mutation routes
- [ ] Optional `LOCK_WAIT_MS` (default 45000) in `.env.example` + compose comments

### Non-functional

- [ ] No new runtime services
- [ ] Failed mutation must not poison the in-process wait chain
- [ ] Crash / kill releases locks (PG session end / fd close)
- [ ] Update `DESIGN.md`, `AGENTS.md` (web), foam vault-engine pointer to ADR-007

## Related project memory

- [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] — single Git writer (consequence updated by ADR-007)
- [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]] — this decision
- [[../foam/architecture/vault-engine|Vault engine]] — concurrency section
- [[../foam/architecture/roadmap|Roadmap]] — P7 next

## Open questions

_(None — resolved in design brainstorm 2026-07-20.)_

| Topic | Decision |
| ----- | -------- |
| Shared volume vs multi-disk | Shared volume first; multi-disk later |
| Backend | Postgres advisory; flock without DB |
| Contended lock | Wait ~45s then 503 |
| Module shape | `lock.ts` beside vault write path |

## Success metrics

- Two Node processes + shared volume + Postgres: concurrent writes → zero Git corruption
- No `DATABASE_URL`: flock serializes two processes
- Single-process autosave/MCP: no regression

## Issue breakdown (GitHub)

| Issue | Scope |
| ----- | ----- |
| [#119](https://github.com/chatondearu/fluffmind/issues/119) | WorkspaceLock module + local chain |
| [#120](https://github.com/chatondearu/fluffmind/issues/120) | Postgres advisory backend |
| [#121](https://github.com/chatondearu/fluffmind/issues/121) | flock fallback |
| [#122](https://github.com/chatondearu/fluffmind/issues/122) | HTTP 503 + `LOCK_WAIT_MS` |
| [#123](https://github.com/chatondearu/fluffmind/issues/123) | Concurrent two-process smoke |
| [#124](https://github.com/chatondearu/fluffmind/issues/124) | Docs after ship |

## Implementation pointer

Plan: [[../plans/PLAN-031-p7-distributed-workspace-lock|PLAN-031]]
