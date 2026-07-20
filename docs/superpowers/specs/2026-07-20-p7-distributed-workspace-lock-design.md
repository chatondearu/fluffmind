# P7a — Distributed workspace lock (design)

**Date:** 2026-07-20  
**Status:** approved (product design)  
**PRD:** `prd/PRD-031-p7-distributed-workspace-lock.md`  
**ADR:** `foam/decisions/ADR-007-distributed-workspace-lock.md`  
**Epic:** [#28](https://github.com/chatondearu/fluffmind/issues/28)  
**Scope:** distributed lock only — static publishing is a separate follow-up PRD

## Problem

Vault mutations are serialized with an **in-memory** promise chain per `workspaceId`
(`apps/web/server/vault/write.ts`). That is correct for concurrent writers inside **one**
Node process (tabs, MCP, autosave). It is **incorrect** when two server instances share
the same workspace working copy (Coolify/Docker scale, rolling deploy overlap): each
process has its own `Map`, so `git add/commit/push` can interleave and corrupt the
working copy or diverge history.

Solo → multi-user migration should keep the **same lock semantics** whenever Postgres is
available (already true in Docker Compose even with `AUTH_DISABLED`).

## Goals

1. Serialize all vault mutations for a given workspace **across processes** when
   `DATABASE_URL` is set (Postgres session advisory locks).
2. When `DATABASE_URL` is absent (bare local `pnpm` without DB), serialize via **`flock`**
   on a lockfile under the vault/workspace path.
3. Preserve the existing public API: `withWorkspaceWriteLock(workspaceId, fn)`.
4. Wait up to ~45s for the lock; on timeout return **503** (ASCII `statusMessage`).
5. Keep an in-process promise chain **inside** the distributed acquire so one instance
   does not stampede Postgres/flock for every concurrent local request.

## Non-goals (this PRD)

- Multi-disk / per-instance working copies coordinated only via Git remote (follow-up).
- Static site export / Quartz-style publishing (follow-up PRD under epic #28).
- Redis or any new infra service.
- Cross-instance vault index coherence beyond “single writer + local invalidate”
  (sufficient while replicas share the working-copy volume).

## Decisions (locked in brainstorming)

| Topic | Choice |
| ----- | ------ |
| Deploy target v1 | Shared `WORKSPACES_ROOT` / vault volume across replicas |
| Lock backend | Postgres advisory when `DATABASE_URL`; else flock |
| Solo without DB | flock (+ local chain) |
| Contended lock | Block/wait ~45s (`LOCK_WAIT_MS`), then 503 |
| Structure | `WorkspaceLock` module in `apps/web/server/vault/lock.ts` |

## Architecture

```
mutation (write / rename / delete)
        │
        ▼
withWorkspaceWriteLock(workspaceId, fn)   // public API unchanged
        │
        ▼
local promise chain (Map per process, per workspaceId)
        │
        ▼
acquire distributed lock
   ├── DATABASE_URL set  →  pg_advisory_lock on dedicated PoolClient
   └── else              →  flock on <vaultRoot>/.fluffmind/locks/<safeId>
        │
        ▼
fn()  →  filesystem + git commit/push
        │
        ▼
release → unlock + client.release() / close fd
```

### Postgres advisory lock

- Use **session-level** `pg_advisory_lock(key1, key2)` (not transaction-scoped): Git work
  can take seconds; holding an open transaction that long is undesirable.
- **Must** hold the lock on a dedicated `pg.PoolClient` checked out for the whole
  critical section. Returning the client to the pool while locked would allow another
  query to run on a different logical session and break unlock semantics.
- Key derivation: stable 64-bit pair from `workspaceId` (e.g. two 32-bit hashes, or
  `hashtext`-style split). Document the algorithm in code; collisions across different
  ids are acceptable only if astronomically rare — prefer a well-known hash split.
- Wait with timeout: **loop `pg_try_advisory_lock` + short sleep** until success or
  `LOCK_WAIT_MS` elapses. Do **not** use blocking `pg_advisory_lock` with an external
  abort (avoids orphaned waiters on the server after client timeout).
- On process crash: TCP session drops → Postgres releases session advisory locks.

### flock fallback

- Lockfile path: `{vaultOrWorkspaceRoot}/.fluffmind/locks/{sanitizedWorkspaceId}.lock`
- Ensure directory exists; create lockfile if missing.
- Exclusive non-blocking try in a loop until timeout (same `LOCK_WAIT_MS`), or
  blocking flock with an async timeout wrapper — pick one and test on macOS + Linux
  (Alpine runner).
- Add `.fluffmind/` to vault ignore guidance if needed so lockfiles are not committed
  to user Git remotes (prefer placing locks **outside** the Git work tree when
  possible — e.g. sibling dir under `WORKSPACES_ROOT/.locks/<workspaceId>` for auth
  mode, and for `AUTH_DISABLED` use a path under `os.tmpdir()` or next to vault but
  gitignored). **Decision for implementers:** prefer
  `WORKSPACES_ROOT/.fluffmind-locks/<workspaceId>.lock` when auth/workspaces root
  exists; for legacy `VAULT_PATH`-only mode use
  `<VAULT_PATH>/../.fluffmind-locks/<hash>.lock` or `path.join(VAULT_PATH, '.fluffmind', 'locks', ...)`
  **and** ensure `ensureWorkingCopy` / git add never stages `.fluffmind/**`
  (update gitignore in working copy or use a path outside the repo).

**Preferred lockfile location (normative):**

- Auth / `WORKSPACES_ROOT`: `{WORKSPACES_ROOT}/.fluffmind-locks/{workspaceId}.lock`
  (outside each workspace git dir).
- Solo `VAULT_PATH` without workspaces root: `{dirname(VAULT_PATH)}/.fluffmind-locks/{hash(VAULT_PATH)}.lock`
  if writable; else `{VAULT_PATH}/.fluffmind/locks/workspace.lock` + exclude from git add.

### Local promise chain

Keep today’s semantics: failed `fn` does not poison the chain (`.then(run, run)` +
settle to `undefined`). The chain wraps the distributed acquire so concurrent requests
on one instance queue locally first.

## Error mapping

| Condition | HTTP | Notes |
| --------- | ---- | ----- |
| Lock wait exceeded | 503 | `statusMessage` ASCII-only; detail in `message` |
| Git conflict (existing) | 409 | unchanged |
| Invalid note id | 400 | unchanged |

Env: `LOCK_WAIT_MS` optional, default `45000`.

## Files (expected touch list)

| Path | Role |
| ---- | ---- |
| `apps/web/server/vault/lock.ts` | New: backends + `withWorkspaceLock` |
| `apps/web/server/vault/write.ts` | Delegate to `lock.ts`; remove inline Map |
| `apps/web/server/vault/mutations.ts` | Unchanged (already uses `withWorkspaceWriteLock`) |
| `apps/web/server/vault/lock.test.ts` | Unit tests (hash, timeout mock, flock) |
| `.env.example` / compose comments | Document `LOCK_WAIT_MS` |
| `apps/web/AGENTS.md` / `DESIGN.md` | Point to ADR-007 |

## Test plan

1. **Unit:** key hash stability; timeout path returns a typed `WorkspaceLockTimeoutError`.
2. **Integration (optional CI):** two Node scripts / vitest workers, shared temp dir +
   testcontainers Postgres (or compose service), concurrent `writeToWorkspace` →
   serialized commits, no lost writes.
3. **Manual:** `AUTH_DISABLED` without `DATABASE_URL` — two `nuxt` processes or a small
   script using flock path; confirm serialization.
4. **Regression:** single process autosave / MCP write still works with Postgres.

## Success metrics

- Two processes + shared volume + Postgres: concurrent writes → no corrupt git state.
- No `DATABASE_URL`: flock serializes two processes on same machine.
- Single process: no user-visible regression; p95 autosave unaffected beyond lock wait
  under contention.

## Follow-ups (not this PRD)

- P7b: multi-disk working copies + Git-remote-only coordination under the same lock API.
- P7c: static publishing / export.
- Future ADR if lockfile or key algorithm changes.

## References

- ADR-002 (single server-side Git writer)
- `foam/architecture/vault-engine.md` (concurrency section)
- Epic [#28](https://github.com/chatondearu/fluffmind/issues/28)
