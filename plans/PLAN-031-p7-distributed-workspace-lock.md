# PLAN-031 — P7a Distributed workspace lock

- **Status**: draft
- **PRD**: [[../prd/PRD-031-p7-distributed-workspace-lock|PRD-031]]
- **GitHub**: Epic [#28](https://github.com/chatondearu/fluffmind/issues/28)
- **Date**: 2026-07-20
- **Design**: `docs/superpowers/specs/2026-07-20-p7-distributed-workspace-lock-design.md`
- **ADR**: [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]]

## Summary

Replace the in-memory-only workspace lock with a `WorkspaceLock` module: Postgres
session advisory locks when `DATABASE_URL` is set, flock otherwise; keep the local
promise chain; wait ~45s then 503. Public API `withWorkspaceWriteLock` stays stable.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Notes stay in Git — lock must not move content to Postgres |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | Only server mutates Git; all mutations under the lock |
| [[../foam/decisions/ADR-003-simple-git-binary|ADR-003]] | Real `git` binary — critical section may be slow (seconds) |
| [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]] | PG advisory + flock; dedicated client; shared volume v1 |

## Scope

### In scope

- `apps/web/server/vault/lock.ts` (+ tests)
- Wire `write.ts` / keep `mutations.ts` on `withWorkspaceWriteLock`
- 503 mapping on mutation API routes
- `LOCK_WAIT_MS` docs in `.env.example` (+ compose comments if needed)
- Foam / DESIGN / AGENTS updates pointing at ADR-007

### Out of scope

- Static publishing
- Multi-disk Git-only multi-instance
- Redis

## Technical approach

1. **`lock.ts`**: `withWorkspaceLock(workspaceId, run)` =
   localChain → `acquire(workspaceId)` → `run()` → `release` in `finally`.
2. **Postgres backend**: `getPool().connect()` → `pg_try_advisory_lock` loop until
   success or `LOCK_WAIT_MS` → run → `pg_advisory_unlock` → `client.release()`.
3. **Flock backend**: resolve lockfile path per ADR-007 → exclusive lock with same
   timeout policy → `finally` close.
4. **Errors**: `WorkspaceLockTimeoutError` → `createError({ statusCode: 503, ... })`
   in note/folder handlers (shared helper if repeated).
5. **Keys**: export `advisoryLockKeys(workspaceId): [number, number]` for tests.

## Tasks

- [ ] **T1** — `lock.ts` skeleton + local chain + `WorkspaceLockTimeoutError` — [#119](https://github.com/chatondearu/fluffmind/issues/119)
- [ ] **T2** — Postgres advisory backend + tests — [#120](https://github.com/chatondearu/fluffmind/issues/120)
- [ ] **T3** — Flock backend + path outside git work tree + tests — [#121](https://github.com/chatondearu/fluffmind/issues/121)
- [ ] **T4** — Switch `write.ts` to `lock.ts`; verify mutations still covered
- [ ] **T5** — HTTP 503 mapping + `LOCK_WAIT_MS` in `.env.example` — [#122](https://github.com/chatondearu/fluffmind/issues/122)
- [ ] **T6** — Concurrent two-process smoke — [#123](https://github.com/chatondearu/fluffmind/issues/123)
- [ ] **T7** — Docs: DESIGN, `apps/web/AGENTS.md`, foam; close issues — [#124](https://github.com/chatondearu/fluffmind/issues/124)

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Pool client returned while locked | Never release until unlock in `finally` |
| Lockfile committed to user vault | Paths under `WORKSPACES_ROOT/.fluffmind-locks` / exclude from git add |
| `pg_advisory_lock` waiter orphaned on abort | Prefer `pg_try_advisory_lock` + sleep loop |
| NFS flock flaky | v1 documents local/shared block volume; NFS = unsupported |

## Test plan

- [ ] Unit: key stability; timeout error
- [ ] Unit/integration: PG backend acquire/release
- [ ] Unit: flock serialize two async critical sections
- [ ] Manual/smoke: two processes shared dir + Postgres

## Verification

- [ ] `pnpm --filter @fluffmind/web` test / typecheck
- [ ] Update PRD-031 checkboxes when shipped
- [ ] `./scripts/import-kanban.sh` after closing issues
