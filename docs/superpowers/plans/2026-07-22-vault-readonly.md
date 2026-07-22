# Vault read-only mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject vault mutations when `VAULT_READONLY=true`, via env and portable `--readonly`, with HTTP 403.

**Architecture:** `assertVaultWritable()` at the start of `withWorkspaceLock` (before lock acquisition). Portable launchers export the same env. No UI public flag.

**Tech Stack:** Nuxt/Nitro server vault (`apps/web/server/vault`), Vitest, portable shell/cmd launchers.

**Spec:** `docs/superpowers/specs/2026-07-22-vault-readonly-design.md`

## Global Constraints

- Env: only exact `VAULT_READONLY=true` enables read-only (same style as `AUTH_DISABLED`)
- HTTP: 403, `statusMessage: 'Vault read-only'`
- No `runtimeConfig.public` / UI changes
- Single choke point: `withWorkspaceLock` in `lock.ts`

---

### Task 1: Helper + unit tests

**Files:**
- Create: `apps/web/server/vault/readonly.ts`
- Create: `apps/web/server/vault/readonly.test.ts`

**Interfaces:**
- Produces: `isVaultReadonly(): boolean`, `VaultReadOnlyError`, `assertVaultWritable(): void`

- [x] **Step 1: Write failing tests** in `readonly.test.ts`
- [x] **Step 2: Implement `readonly.ts`**
- [x] **Step 3: Run tests** — `pnpm --filter @fluffmind/web exec vitest run server/vault/readonly.test.ts`
- [ ] **Step 4: Commit** `feat(vault): add VAULT_READONLY guard helper`

### Task 2: Wire lock + HTTP 403

**Files:**
- Modify: `apps/web/server/vault/lock.ts`
- Modify: `apps/web/server/utils/vault-mutation-error.ts`
- Modify: `apps/web/server/vault/lock.test.ts` (optional case if easy)

- [x] **Step 1: Call `assertVaultWritable()` at start of `withWorkspaceLock`**
- [x] **Step 2: Map `VaultReadOnlyError` → 403 in `rethrowVaultMutationError`**
- [x] **Step 3: Run vault lock + related tests**
- [ ] **Step 4: Commit** `feat(vault): reject mutations when VAULT_READONLY`

### Task 3: Portable CLI + docs

**Files:**
- Modify: `scripts/portable/fluffmind.sh`, `fluffmind.cmd`, `README.txt`
- Modify: `.env.example`, `README.md`, `apps/web/AGENTS.md`
- Modify compose comments if they list vault env vars

- [x] **Step 1: Add `--readonly` to launchers**
- [x] **Step 2: Document env + examples**
- [ ] **Step 3: Commit** `feat(portable): add --readonly flag for vault`

### Task 4: Verify

- [x] Run `pnpm --filter @fluffmind/web exec vitest run server/vault/`
- [ ] Spot-check typecheck if needed
