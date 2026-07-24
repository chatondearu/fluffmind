# GitHub App Installations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each self-hosted Fluffmind instance use its own GitHub App so owners can install once, bind one repo per workspace, and sync/push with short-lived installation tokens — while keeping PAT linking as fallback.

**Architecture:** Add DB tables/columns for installations + `authMode`. Mint App JWTs / installation tokens in `@fluffmind/integrations`. Resolve credentials per workspace (`app` → installation token, else PAT). Use tokens for collaborator sync and for runtime-authenticated git remotes (`https://x-access-token:…@github.com/…`). Extend webhooks + settings UI; document operator App setup.

**Tech Stack:** Drizzle/Postgres, `@octokit/auth-app` (or equivalent JWT+fetch), existing Better Auth OAuth login, Nitro routes, Vue settings page.

**Spec:** `docs/superpowers/specs/2026-07-24-github-app-installations-design.md`  
**PRD:** `prd/PRD-033-github-app-installations.md`  
**ADR:** `foam/decisions/ADR-009-github-app-installations.md` (proposed → accepted on ship)

## Global Constraints

- Do **not** replace GitHub OAuth login (`GITHUB_CLIENT_ID` / `SECRET`).
- Do **not** remove PAT fallback (`authMode=pat`).
- Preserve ADR-006 hybrid sync (`localOverride`, manual invites).
- Server remains sole Git writer (ADR-002).
- Do **not** persist long-lived installation access tokens (mint on demand; optional short in-memory cache).
- Installations are **instance-scoped**.
- Vue: `<script setup lang="ts>` + typed props; UI copy in French; code comments in English.
- Conventional Commits: `feat(db):`, `feat(integrations):`, `feat(web):`, `docs:`.
- Tests: `pnpm --filter @fluffmind/integrations run test`, `pnpm --filter @fluffmind/web run test`, `pnpm --filter @fluffmind/db run typecheck`.
- Keep `.env.example`, `docker-compose.yml`, `docker-compose.coolify.yml` aligned for new env vars.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/db/src/schema/workspace.ts` | `githubAppInstallation` table; extend `workspaceGithubLink` |
| `packages/db/drizzle/*` | Generated migration |
| `packages/integrations/src/github/app-auth.ts` | App JWT + installation token minting |
| `packages/integrations/src/github/app-auth.test.ts` | Unit tests (mocked fetch / clock) |
| `packages/integrations/src/github/remote-url.ts` | Build authenticated HTTPS remote URL |
| `packages/integrations/src/index.ts` | Re-exports |
| `apps/web/server/utils/github-credentials.ts` | Resolve token for workspace (`app` \| `pat`) |
| `apps/web/server/utils/github-sync.ts` | Use resolver instead of raw `syncToken` |
| `apps/web/server/vault/workspace.ts` | Optional authenticated `remoteUrl` for git ops |
| `apps/web/server/api/github/app/*.ts` | Status, install URL, callback, list installations/repos |
| `apps/web/server/api/workspaces/github/link.post.ts` | Support `mode: 'app' \| 'pat'` |
| `apps/web/server/api/webhooks/github.post.ts` | Handle installation events (+ keep push) |
| `apps/web/app/pages/settings/workspace.vue` | App bind UI + mode badge + PAT fallback |
| `.env.example` + compose files | New App env vars |
| `AGENTS.md` / `apps/web/AGENTS.md` | Operator notes for App env |

---

### Task 1: Schema — installations + link columns

**Files:**
- Modify: `packages/db/src/schema/workspace.ts`
- Generate: `packages/db/drizzle/0001_*.sql` (via drizzle-kit)

**Interfaces:**
- Produces tables/columns matching the design spec.

- [ ] **Step 1: Extend schema**

In `packages/db/src/schema/workspace.ts` add `githubLinkAuthMode` enum, `githubAppInstallation` table, and extend `workspaceGithubLink` with `authMode`, nullable `installationId`, nullable `syncToken` (see design spec). Migration must alter existing `sync_token` from `NOT NULL` → nullable and set `auth_mode='pat'` for existing rows.

- [ ] **Step 2: Generate migration**

Run: `pnpm --filter @fluffmind/db run db:generate`

Review SQL: safe `ALTER` + backfill `auth_mode`.

- [ ] **Step 3: Typecheck db package**

Run: `pnpm --filter @fluffmind/db run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
feat(db): add GitHub App installation schema and link authMode

EOF
)"
```

---

### Task 2: App auth + remote URL helpers (TDD)

**Files:**
- Create: `packages/integrations/src/github/app-auth.ts`
- Create: `packages/integrations/src/github/app-auth.test.ts`
- Create: `packages/integrations/src/github/remote-url.ts`
- Create: `packages/integrations/src/github/remote-url.test.ts`
- Modify: `packages/integrations/src/index.ts`
- Dependency: `pnpm --filter @fluffmind/integrations add @octokit/auth-app`

**Interfaces:**
- Produces:
  ```ts
  export interface GitHubAppCredentials {
    appId: string
    privateKey: string // PEM
  }

  export function createInstallationToken(
    creds: GitHubAppCredentials,
    installationId: string,
    options?: { repositoryIds?: number[], repositories?: string[] },
  ): Promise<{ token: string, expiresAt: string }>

  export function buildGitHubHttpsRemoteUrl(owner: string, repo: string): string
  export function withGitHubAccessToken(remoteUrl: string, token: string): string
  ```

- [ ] **Step 1: Write failing tests for remote-url helpers**

```ts
import { describe, expect, it } from 'vitest'
import { buildGitHubHttpsRemoteUrl, withGitHubAccessToken } from './remote-url'

describe('buildGitHubHttpsRemoteUrl', () => {
  it('builds canonical https remote', () => {
    expect(buildGitHubHttpsRemoteUrl('acme', 'vault')).toBe(
      'https://github.com/acme/vault.git',
    )
  })
})

describe('withGitHubAccessToken', () => {
  it('embeds x-access-token userinfo', () => {
    expect(
      withGitHubAccessToken('https://github.com/acme/vault.git', 'ghs_test'),
    ).toBe('https://x-access-token:ghs_test@github.com/acme/vault.git')
  })

  it('replaces existing userinfo', () => {
    expect(
      withGitHubAccessToken(
        'https://x-access-token:old@github.com/acme/vault.git',
        'ghs_new',
      ),
    ).toBe('https://x-access-token:ghs_new@github.com/acme/vault.git')
  })
})
```

- [ ] **Step 2: Implement `remote-url.ts` and pass tests**

Use `URL` parsing; set `username=x-access-token`, `password=token`.

- [ ] **Step 3: Add `@octokit/auth-app`; implement `createInstallationToken`**

Prefer `createAppAuth` → `auth({ type: 'installation', installationId })`. Inject auth dependency for unit tests.

- [ ] **Step 4: Export from package index; run integrations tests**

Run: `pnpm --filter @fluffmind/integrations run test`

- [ ] **Step 5: Commit**

```bash
git add packages/integrations pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(integrations): add GitHub App installation token and remote URL helpers

EOF
)"
```

---

### Task 3: Workspace credential resolver + wire collaborator sync

**Files:**
- Create: `apps/web/server/utils/github-credentials.ts`
- Create: `apps/web/server/utils/github-credentials.test.ts`
- Modify: `apps/web/server/utils/github-sync.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GitHubAuthMode = 'app' | 'pat'

  export interface ResolvedGitHubCredentials {
    mode: GitHubAuthMode
    token: string
    owner: string
    repo: string
    installationId?: string
  }

  export function isGitHubAppConfigured(): boolean
  export async function resolveWorkspaceGitHubCredentials(
    organizationId: string,
  ): Promise<ResolvedGitHubCredentials | null>
  ```

- [ ] **Step 1: Implement `isGitHubAppConfigured`**

True when `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` (PEM; support `\n` escapes) are set.

- [ ] **Step 2: Implement `resolveWorkspaceGitHubCredentials`**

Load link. `authMode=app` → mint installation token. `pat` → `decryptSyncToken`. Unlinked → `null`.

- [ ] **Step 3: Change `syncWorkspaceMembersForOrganization` to use the resolver**

- [ ] **Step 4: Tests + typecheck**

```bash
pnpm --filter @fluffmind/web exec vitest run server/utils/github-credentials.test.ts
pnpm --filter @fluffmind/web run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/github-credentials.ts apps/web/server/utils/github-credentials.test.ts apps/web/server/utils/github-sync.ts
git commit -m "$(cat <<'EOF'
feat(web): resolve GitHub App or PAT credentials for collaborator sync

EOF
)"
```

---

### Task 4: Authenticated git remotes at runtime

**Files:**
- Modify: `apps/web/server/vault/workspace.ts` and write/pull/bootstrap call sites

**Approach:** Keep `workspace_config.git_remote_url` as clean `https://github.com/owner/repo.git` (no embedded secret). For git network ops, resolve credentials and pass `withGitHubAccessToken(remoteUrl, token)`.

Note: today PAT is used for collaborator sync only; `.env.example` already documents embedding tokens in `GIT_REMOTE_URL` for P1. App mode must inject tokens at runtime so secrets never sit in `workspace_config`.

- [ ] **Step 1: Add `resolveWorkspaceGitRemoteUrl(workspaceId)`**

- [ ] **Step 2: Thread through write/pull/bootstrap**

- [ ] **Step 3: On App link, set clean `gitRemoteUrl` via `buildGitHubHttpsRemoteUrl`**

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): use installation or PAT tokens for git remote HTTPS auth

EOF
)"
```

---

### Task 5: Link API supports `mode: app | pat`

**Files:**
- Modify: `apps/web/server/api/workspaces/github/link.post.ts`

- [ ] **Step 1: Accept body**

```ts
interface LinkWorkspaceGitHubBody {
  repository?: string
  mode?: 'app' | 'pat'
  syncToken?: string
  installationId?: string
}
```

- `mode=pat` (default): require `syncToken`; validate collaborators; store encrypted token; clear `installationId`.
- `mode=app`: require `installationId`; App configured; validate repo with installation token; `syncToken=null`; set clean `gitRemoteUrl`.

- [ ] **Step 2: Extend `GitHubSyncState` with `authMode` + `appConfigured`**

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): support GitHub App mode on workspace link endpoint

EOF
)"
```

---

### Task 6: Install flow APIs + webhook installation events

**Files:**
- Create: `apps/web/server/api/github/app/status.get.ts`
- Create: `apps/web/server/api/github/app/install-url.get.ts`
- Create: `apps/web/server/api/github/app/callback.get.ts`
- Create: `apps/web/server/api/github/installations/index.get.ts`
- Create: `apps/web/server/api/github/installations/[installationId]/repos.get.ts`
- Modify: `apps/web/server/api/webhooks/github.post.ts`

**Env:** `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`, `GITHUB_APP_WEBHOOK_SECRET` (fallback `GITHUB_WEBHOOK_SECRET`).

Install URL: `https://github.com/apps/<slug>/installations/new`.  
v1 authz for recording installations: any authenticated user with at least one **owner** membership.

- [ ] **Step 1: `status.get` → `{ configured: boolean }`**
- [ ] **Step 2: `install-url.get` → `{ url }`**
- [ ] **Step 3: Callback / webhook `installation` created → upsert `github_app_installation`**
- [ ] **Step 4: List installations + repos**
- [ ] **Step 5: On uninstall / repo removal — prune DB; clear affected `workspace_github_link` (vault files stay on disk)**
- [ ] **Step 6: Keep `push` handling**
- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add GitHub App install APIs and installation webhooks

EOF
)"
```

---

### Task 7: Settings UI

**Files:**
- Modify: `apps/web/app/pages/settings/workspace.vue`

- [ ] **Step 1: Badge `Mode : App | PAT | Non lié`**
- [ ] **Step 2: If App configured — « Lier via GitHub App » (install → pick installation → pick repo → `mode: 'app'`)**
- [ ] **Step 3: Keep PAT form as secondary « Fallback PAT »**
- [ ] **Step 4: French copy only**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add GitHub App linking UI with PAT fallback

EOF
)"
```

---

### Task 8: Env docs + ADR accept + status

**Files:**
- Modify: `.env.example`, compose files, `AGENTS.md`, `apps/web/AGENTS.md`
- Modify: ADR-009 → `accepted` on ship; PRD-033 status/checkboxes; `foam/index.md`
- Create: `plans/PLAN-033-github-app-installations.md` (short pointer)

- [ ] **Step 1: Document env vars** (App ID, PEM, slug, webhook secret)
- [ ] **Step 2: Operator blurb — App permissions Contents R/W, Metadata R, Members/collaborators R**
- [ ] **Step 3: Final verification**

```bash
pnpm --filter @fluffmind/db run typecheck
pnpm --filter @fluffmind/integrations run test
pnpm --filter @fluffmind/web run test
pnpm --filter @fluffmind/web run typecheck
```

- [ ] **Step 4: Commit docs**

```bash
git commit -m "$(cat <<'EOF'
docs: document GitHub App env setup and accept ADR-009

EOF
)"
```

---

## Spec coverage checklist

| Spec / PRD item | Task |
| --------------- | ---- |
| Per-instance App credentials | 2, 6, 8 |
| Installation → N workspaces; 1 repo each | 1, 5, 6, 7 |
| Installation tokens for sync | 2, 3 |
| Installation tokens for git | 2, 4 |
| PAT fallback | 5, 7 |
| Hybrid sync unchanged | 3 |
| Webhooks installation* | 6 |
| Env / compose parity | 8 |

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Collaborators API permission mismatch for Apps | Validate live; adjust documented permission |
| Token in git remote | Inject only in-memory; never store tokenized URL in `workspace_config` |
| Dual webhook secrets | Prefer `GITHUB_APP_WEBHOOK_SECRET`, fallback to `GITHUB_WEBHOOK_SECRET` |

## Out of scope

- Marketplace / single official Fluffmind App
- Multi-repo per workspace
- Forced PAT migration wizard
