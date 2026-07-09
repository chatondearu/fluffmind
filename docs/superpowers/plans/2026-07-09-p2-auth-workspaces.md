# P2 Auth & Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multi-account workspaces with Better Auth, Drizzle/Postgres, custom roles, invitations, and hybrid GitHub collaborator sync — while keeping auth optional for local dev.

**Architecture:** `packages/db` owns Drizzle schema + Better Auth server config; `apps/web` mounts `/api/auth/[...all]`, protects vault APIs via Nitro middleware, and resolves per-org vault paths from Postgres. `packages/integrations/src/github/` handles collaborator sync.

**Tech Stack:** Better Auth (organization plugin + `createAccessControl`), Drizzle ORM, Postgres 17, Nuxt 4 / Nitro, existing `writeToWorkspace` path.

**Spec:** `docs/superpowers/specs/2026-07-09-p2-auth-workspaces-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/db/src/schema/auth.ts` | Better Auth tables (generated baseline) |
| `packages/db/src/schema/workspace.ts` | `workspace_config`, `workspace_github_link`, `member_sync_meta` |
| `packages/db/src/permissions.ts` | `createAccessControl` roles: read, write, owner |
| `packages/db/src/auth.ts` | `betterAuth()` server instance |
| `packages/db/src/client.ts` | Drizzle `db` singleton from `DATABASE_URL` |
| `packages/db/drizzle.config.ts` | Drizzle Kit config |
| `apps/web/server/api/auth/[...all].ts` | Better Auth Nitro handler |
| `apps/web/server/middleware/auth.ts` | Session + role guards |
| `apps/web/server/utils/auth.ts` | `isAuthEnabled()`, `requireSession()`, `requireWorkspaceRole()` |
| `apps/web/server/vault/workspace.ts` | Postgres-backed `resolveWorkspaceConfig` |
| `packages/integrations/src/github/collaborators.ts` | Fetch + map GitHub permissions |
| `packages/integrations/src/github/sync.ts` | `syncWorkspaceMembersFromGitHub()` |
| `apps/web/app/composables/useAuth.ts` | Client session + workspace switcher state |
| `apps/web/app/pages/login.vue` | Login UI |
| `apps/web/app/pages/signup.vue` | Signup UI (first user = admin) |
| `apps/web/app/pages/settings/workspace.vue` | Members, GitHub link, sync |

---

## Slice 1 — DB + Better Auth foundation

### Task 1: Scaffold `packages/db` dependencies

**Files:**
- Modify: `packages/db/package.json`
- Modify: `pnpm-workspace.yaml` (allowBuilds if native builds needed)

- [ ] **Step 1: Add dependencies to `packages/db/package.json`**

```json
{
  "name": "@fluffmind/db",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc --noEmit -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "better-auth": "^1.6.23",
    "@better-auth/drizzle-adapter": "^1.6.23",
    "drizzle-orm": "^0.44.2",
    "pg": "^8.16.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.4",
    "@types/pg": "^8.15.4"
  }
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`  
Expected: clean install, no `ERR_PNPM_IGNORED_BUILDS`

- [ ] **Step 3: Commit**

```bash
git add packages/db/package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "build(db): add Better Auth, Drizzle, and pg dependencies"
```

### Task 2: Drizzle schema + permissions

**Files:**
- Create: `packages/db/src/schema/workspace.ts`
- Create: `packages/db/src/permissions.ts`
- Create: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create `packages/db/src/permissions.ts`**

```ts
import { createAccessControl } from 'better-auth/plugins/access'

export const statements = {
  note: ['read', 'write'],
  workspace: ['manage']
} as const

export const ac = createAccessControl(statements)

export const read = ac.newRole({ note: ['read'] })
export const write = ac.newRole({ note: ['read', 'write'] })
export const owner = ac.newRole({ note: ['read', 'write'], workspace: ['manage'] })

export const roles = { read, write, owner }
```

- [ ] **Step 2: Create `packages/db/src/schema/workspace.ts`** with `workspace_config`, `workspace_github_link`, `member_sync_meta` tables per spec (use `pgTable`, `text`, `boolean`, `timestamp`).

- [ ] **Step 3: Export from `packages/db/src/index.ts`**

```ts
export { db } from './client'
export { auth } from './auth'
export { ac, roles } from './permissions'
export * from './schema/workspace'
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @fluffmind/db typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(db): add workspace extension schema and custom roles"
```

### Task 3: Better Auth server + Drizzle client

**Files:**
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/auth.ts`
- Create: `packages/db/drizzle.config.ts`

- [ ] **Step 1: `client.ts`** — `Pool` from `pg`, `drizzle(pool)`, export `db`, throw if `DATABASE_URL` missing when imported in auth mode.

- [ ] **Step 2: `auth.ts`** — `betterAuth({ database: drizzleAdapter(db, { provider: 'pg' }), emailAndPassword: { enabled: true }, socialProviders: { github: { clientId, clientSecret } }, plugins: [ organization({ ac, roles, sendInvitationEmail }) ] })`

- [ ] **Step 3: Generate Better Auth schema** via CLI (`npx @better-auth/cli generate`) into `packages/db/src/schema/auth.ts`, merge exports in `schema/index.ts`.

- [ ] **Step 4: `drizzle.config.ts`** pointing at `DATABASE_URL` and `./src/schema`.

- [ ] **Step 5: Generate + run migration**

Run: `pnpm --filter @fluffmind/db db:generate && pnpm --filter @fluffmind/db db:migrate`  
Expected: tables created in local Postgres (`docker compose up postgres -d`)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(db): configure Better Auth with Drizzle adapter and migrations"
```

### Task 4: Mount auth handler in Nuxt

**Files:**
- Create: `apps/web/server/api/auth/[...all].ts`
- Create: `apps/web/app/composables/useAuth.ts`
- Modify: `apps/web/package.json` (add `@fluffmind/db`, `better-auth` client)

- [ ] **Step 1: Handler**

```ts
import { auth } from '@fluffmind/db'

export default defineEventHandler((event) => auth.handler(toWebRequest(event)))
```

(Use Better Auth Nuxt docs pattern — `toWebRequest` from `h3` if needed.)

- [ ] **Step 2: Client composable** with `createAuthClient` from `better-auth/vue`, plugins: `[organizationClient({ ac, roles })]`.

- [ ] **Step 3: Verify handler responds**

Run: `pnpm --filter @fluffmind/web dev` with `DATABASE_URL` set  
Request: `GET http://localhost:3000/api/auth/ok`  
Expected: 200

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): mount Better Auth API handler and client composable"
```

---

## Slice 2 — Auth optional + bootstrap

### Task 5: Auth utilities + middleware

**Files:**
- Create: `apps/web/server/utils/auth.ts`
- Create: `apps/web/server/middleware/auth.ts`

- [ ] **Step 1: `isAuthEnabled()`**

```ts
export function isAuthEnabled(): boolean {
  if (process.env.AUTH_DISABLED === 'true') return false
  return Boolean(process.env.DATABASE_URL)
}
```

- [ ] **Step 2: `getSession(event)`** — call `auth.api.getSession({ headers: event.headers })`.

- [ ] **Step 3: Middleware** — if `!isAuthEnabled()` return; else require session on `/api/notes`, `/api/graph`, `/api/sync-status`; allow `/api/auth/**`.

- [ ] **Step 4: Manual test** — without `DATABASE_URL`, `GET /api/notes` works; with `DATABASE_URL`, returns 401.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): add optional auth middleware for vault APIs"
```

### Task 6: First-user admin bootstrap

**Files:**
- Modify: `packages/db/src/auth.ts` (databaseHooks on user create)
- Create: `apps/web/app/pages/signup.vue`
- Create: `apps/web/app/pages/login.vue`

- [ ] **Step 1: Hook** — `databaseHooks.user.create.after`: if user count === 1, set `role: 'admin'` via additional field on `user` table.

- [ ] **Step 2: Signup page** — email/password form calling `authClient.signUp.email`; GitHub button via `authClient.signIn.social({ provider: 'github' })`.

- [ ] **Step 3: Login page** — same pattern with `signIn.email` + GitHub.

- [ ] **Step 4: Redirect** — unauthenticated users hitting `/` → `/login` when auth enabled.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): add login/signup pages and first-user admin bootstrap"
```

---

## Slice 3 — Multi-workspace vault paths

### Task 7: Workspace config CRUD + resolver

**Files:**
- Modify: `apps/web/server/vault/workspace.ts`
- Create: `apps/web/server/api/workspaces/index.post.ts`
- Create: `apps/web/server/api/workspaces/active.get.ts`

- [ ] **Step 1: Rewrite `resolveWorkspaceConfig(workspaceId)`** — auth off: env; auth on: query `workspace_config` by id, `mkdir -p` vault path under `WORKSPACES_ROOT`.

- [ ] **Step 2: `POST /api/workspaces`** — create organization via Better Auth API + insert `workspace_config` row.

- [ ] **Step 3: Active workspace** — cookie `fluffmind-workspace-id`; validate membership.

- [ ] **Step 4: Update `writeToWorkspace('default', ...)` call sites** to use active workspace id from session.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): resolve vault paths from Postgres per organization"
```

### Task 8: Vault adoption from legacy `VAULT_PATH`

**Files:**
- Create: `apps/web/server/api/workspaces/adopt.post.ts`

- [ ] **Step 1: Endpoint** — owner-only; if `VAULT_PATH` env set and target org vault empty, copy or symlink contents into `{WORKSPACES_ROOT}/{orgId}/`.

- [ ] **Step 2: Document in settings UI**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(web): adopt legacy VAULT_PATH into first workspace"
```

---

## Slice 4 — Roles + invitations

### Task 9: Role enforcement on write routes

**Files:**
- Modify: `apps/web/server/middleware/auth.ts`
- Modify: `apps/web/server/api/notes/[...id].put.ts`
- Modify: `apps/web/server/api/notes/index.post.ts`

- [ ] **Step 1: `requireWorkspacePermission(event, 'note', 'write')`** using Better Auth organization `hasPermission` API.

- [ ] **Step 2: Apply to PUT/POST notes** — return 403 for `read` role.

- [ ] **Step 3: Manual test** — read member gets 403 on save.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): enforce write role on note mutations"
```

### Task 10: Invitations UI

**Files:**
- Create: `apps/web/app/pages/settings/workspace.vue`
- Modify: `packages/db/src/auth.ts` (`sendInvitationEmail` — log link in dev)

- [ ] **Step 1: Settings page** — list members, invite by email + role select (`read`|`write`|`owner`), insert `member_sync_meta { source: 'manual' }` on accept.

- [ ] **Step 2: Accept invitation route** `/accept-invitation/[id]`

- [ ] **Step 3: Workspace switcher in `app.vue`** when user has multiple orgs.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): add workspace settings, invitations, and switcher"
```

---

## Slice 5 — GitHub hybrid sync

### Task 11: GitHub collaborators client

**Files:**
- Create: `packages/integrations/src/github/collaborators.ts`
- Create: `packages/integrations/src/github/sync.ts`
- Modify: `packages/integrations/src/index.ts`

- [ ] **Step 1: `fetchCollaborators(token, owner, repo)`** — Octokit or `fetch` to REST API.

- [ ] **Step 2: `mapGitHubPermission(permission)`** → `read`|`write`|`owner` per spec.

- [ ] **Step 3: `syncWorkspaceMembersFromGitHub(orgId)`** — upsert github-sourced members, skip `localOverride`, never delete `manual` members.

- [ ] **Step 4: Unit test mapping function** in `packages/integrations/src/github/collaborators.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(integrations): add GitHub collaborator fetch and sync"
```

### Task 12: Link repo + cron + manual sync

**Files:**
- Create: `apps/web/server/api/workspaces/github/link.post.ts`
- Create: `apps/web/server/api/workspaces/github/sync.post.ts`
- Create: `apps/web/server/plugins/github-sync-cron.ts`

- [ ] **Step 1: Link endpoint** — owner-only; store `workspace_github_link` + encrypted token.

- [ ] **Step 2: Sync endpoint** — call `syncWorkspaceMembersFromGitHub`, update `lastSyncedAt`.

- [ ] **Step 3: Nitro plugin** — `setInterval` 1h (single-process MVP), sync all linked workspaces.

- [ ] **Step 4: Settings UI** — GitHub repo input, PAT field, “Sync now”, toggle `localOverride` per member.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): add GitHub repo linking and hybrid member sync"
```

---

## Slice 6 — Docs + deployment

### Task 13: Environment and documentation

**Files:**
- Modify: `.env.example`, `docker-compose.yml`, `docker-compose.coolify.yml`
- Modify: `DESIGN.md`, `README.md`, `AGENTS.md`, `apps/web/AGENTS.md`

- [ ] **Step 1: Add env vars** — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WORKSPACES_ROOT`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_DISABLED`.

- [ ] **Step 2: Coolify compose** — pass new env vars; volume for `/data/workspaces`.

- [ ] **Step 3: Update DESIGN.md** — hybrid GitHub sync bullet per spec.

- [ ] **Step 4: Break down epic #23** into GitHub sub-issues matching slices 1–5.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs: document P2 auth env vars and update architecture notes"
```

### Task 14: Verification gate

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm build` — all green

- [ ] **Step 2:** Auth disabled smoke test (current dev flow)

- [ ] **Step 3:** Auth enabled — signup, create workspace, create note, invite read-only user, verify 403 on write

- [ ] **Step 4:** GitHub sync smoke test against private test repo

---

## Plan self-review (spec coverage)

| Spec section | Task(s) |
|--------------|---------|
| Auth optional mode | Task 5 |
| Data model extensions | Task 2 |
| Custom roles | Task 2, 9 |
| Workspace paths | Task 7 |
| Bootstrap admin | Task 6 |
| API protection | Task 5, 9 |
| Invitations | Task 10 |
| GitHub hybrid sync | Task 11, 12 |
| UI pages | Task 6, 10, 12 |
| Env / Docker | Task 13 |
| DESIGN.md update | Task 13 |

No placeholder steps remain — each task names concrete files and commands.
