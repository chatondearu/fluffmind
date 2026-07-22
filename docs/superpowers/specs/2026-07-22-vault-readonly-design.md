# Vault path + read-only mode (local / portable)

**Date:** 2026-07-22  
**Status:** approved (product design)  
**Scope:** server-side write guard + env/CLI surface — not UI disablement, not Docker `:ro`

## Problem

Local and portable runs already accept a vault path (`VAULT_PATH` / `--vault`), but there is no way to **open a vault without allowing mutations**. Users want to browse an existing Foam/Obsidian vault safely (e.g. shared notes, demo, or “don’t touch my files”) while still using the same Fluffmind binary.

## Goals

1. Keep `VAULT_PATH` / portable `--vault` as the path surface (no new path mechanism).
2. Add a single read-only switch with identical semantics for:
   - env (dev, Docker Compose, Coolify, MCP stdio)
   - portable launcher CLI
3. Enforce on the **server write path only** (HTTP 403 on mutations); UI may still look editable (follow-up).
4. Cover REST and MCP without per-route duplication.

## Non-goals

- `runtimeConfig.public` / hiding editor controls in the UI
- Forcing Docker bind mounts `:ro`
- Wrapper CLI for `pnpm dev` (env is enough for the inner loop)
- Per-workspace read-only when auth is enabled (global env only for v1)

## Decisions

| Topic | Choice |
| ----- | ------ |
| Approach | Guard at write lock entry (not Nitro middleware, not per-handler) |
| Env name | `VAULT_READONLY=true` — unset / any other value = writable |
| Portable flag | `--readonly` → export `VAULT_READONLY=true` |
| HTTP status | 403 |
| UI flag | deferred (choice A) |

## Config surface

| Input | Effect |
| ----- | ------ |
| `VAULT_PATH` | unchanged — absolute path to markdown vault |
| `VAULT_READONLY=true` | all vault mutations rejected |
| `fluffmind … --readonly` | sets `VAULT_READONLY=true` before starting Node |
| `fluffmind … --vault <path>` | unchanged |

Startup log (portable): include `readonly: yes|no` next to the vault path line.

## Enforcement

```
mutation entry
  → withWorkspaceLock (exported as withWorkspaceWriteLock)
       → assertVaultWritable()   // before acquiring lock
       → acquire lock
       → write / rename / delete / create folder
```

- Helper: `assertVaultWritable()` in `apps/web/server/vault/` (e.g. next to `workspace.ts` or a small `readonly.ts`).
- Error class: e.g. `VaultReadOnlyError` — mapped in `rethrowVaultMutationError` to:

  ```ts
  createError({
    statusCode: 403,
    statusMessage: 'Vault read-only',
    message: '…', // human-readable detail
  })
  ```

- Call site: **once** at the start of `withWorkspaceLock` in `lock.ts`, before waiting on Postgres/file lock. That covers:
  - `writeToWorkspace`
  - note/folder rename & delete (`mutations.ts`)
  - folder create (`folders.ts`)
  - MCP tools that call those helpers

Reads (GET notes, index, sync status, webhooks that only refresh) are unchanged.

## DX & docs

- `.env.example` — document `VAULT_READONLY`
- Align comments in `docker-compose.yml` / `docker-compose.coolify.yml` if they list vault env vars
- `scripts/portable/fluffmind.sh` + `fluffmind.cmd` — parse `--readonly`, help text, status/start echo
- `scripts/portable/README.txt` + root `README.md` (dev + portable sections)
- `apps/web/AGENTS.md` — Config bullet for `VAULT_READONLY`

## Tests

- Unit: helper treats only exact `'true'` as read-only (match `AUTH_DISABLED` style).
- Unit/integration: with `VAULT_READONLY=true`, a write path throws `VaultReadOnlyError` (or mapped 403) without needing Postgres.

## Out of scope / follow-ups

- Public `vaultEditable` for UI disablement
- Optional Docker `:ro` mount guidance in Compose examples
- Workspace-scoped read-only under auth (P2+)

## Related

- ADR-002 — single write path (`writeToWorkspace` / lock)
- P8 portable package — `--vault` already shipped (`PRD-032`)
- `AUTH_DISABLED` — naming precedent for restrictive boolean env flags
