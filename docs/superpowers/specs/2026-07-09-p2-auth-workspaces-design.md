# P2 — Auth & workspaces — Design spec

**Date:** 2026-07-09  
**Epic:** [#23](https://github.com/chatondearu/fluffmind/issues/23)  
**Status:** Approved

## Goal

Introduce multi-account workspaces with Better Auth + Drizzle/Postgres, custom roles
(`read` / `write` / `owner`), member invitations, optional GitHub collaborator sync,
while preserving the P1 guarantee that only the server writes Git.

**Exit criteria (from epic #23):** an invited member can authenticate and access a
workspace according to their role; multi-device works (server stays the sole Git writer).

## Decisions (brainstorming 2026-07-09)

| Topic | Decision |
|-------|----------|
| Scope | Full P2 epic in one initiative (internal 5 delivery slices) |
| Auth methods | Email/password + GitHub OAuth |
| Local / dev mode | Auth **off** when `AUTH_DISABLED=true` **or** `DATABASE_URL` unset → current `VAULT_PATH`-only behaviour |
| Vault storage | One directory per workspace: `{WORKSPACES_ROOT}/{organizationId}/` |
| GitHub permissions | **Hybrid** sync (see §6) — updates `DESIGN.md` from “GitHub-only source of truth” |

## Architecture

```
packages/db/           Drizzle schema, Better Auth server config, custom roles (AC)
packages/integrations/ GitHub API (collaborators, repo metadata) — new src/github/
apps/web/
  server/api/auth/[...all].ts
  server/middleware/auth.ts
  server/vault/workspace.ts   ← Postgres-backed resolution (replaces env-only)
  app/pages/login.vue, signup.vue, settings/...
  app/composables/useAuth.ts
```

**Founding principle unchanged:** Postgres never stores note content — only identity,
membership, workspace metadata, and Git sync bookkeeping.

## Auth optional mode

| Condition | Behaviour |
|-----------|-----------|
| `DATABASE_URL` unset **or** `AUTH_DISABLED=true` | Implicit workspace `default`, `VAULT_PATH` from env, no login, APIs behave as P1 |
| `DATABASE_URL` set and auth not disabled | Login required; workspace from session; `VAULT_PATH` env ignored for resolution |

`WORKSPACES_ROOT` defaults to `/data/workspaces` (Docker) or configurable locally.

## Data model

### Better Auth (generated + organization plugin)

Standard tables: `user`, `session`, `account`, `verification`, `organization`,
`member`, `invitation`.

### Custom roles

Use `createAccessControl` with statements:

```ts
const statements = {
  note: ['read', 'write'],
  workspace: ['manage'],
} as const
```

| Role | `note` | `workspace` |
|------|--------|-------------|
| `read` | read | — |
| `write` | read, write | — |
| `owner` | read, write | manage |

Passed to `organization({ ac, roles: { read, write, owner } })` on server and
`organizationClient` on client.

### Extension tables (Drizzle, `packages/db`)

**`workspace_config`**

| Column | Type | Notes |
|--------|------|-------|
| `organizationId` | text PK, FK → organization.id | |
| `vaultPath` | text | Absolute path on server disk |
| `gitRemoteUrl` | text nullable | HTTPS remote for `writeToWorkspace` |
| `gitBranch` | text | Default `main` |
| `createdAt` | timestamp | |

**`workspace_github_link`**

| Column | Type | Notes |
|--------|------|-------|
| `organizationId` | text PK | |
| `owner` | text | GitHub owner |
| `repo` | text | GitHub repo name |
| `syncToken` | text encrypted | PAT or stored OAuth token with `repo` scope |
| `lastSyncedAt` | timestamp nullable | |

**`member_sync_meta`**

| Column | Type | Notes |
|--------|------|-------|
| `memberId` | text PK, FK → member.id | |
| `source` | enum `github` \| `manual` | |
| `localOverride` | boolean | If true, GitHub sync must not change role |

### Instance admin bootstrap

- On `signUp.email` when `user` count is 0: set `user.role = 'admin'` (Better Auth
  `user.additionalFields` or dedicated `instance_admin` table).
- First admin creates the first organization and becomes `owner`.
- **Vault adoption:** if `VAULT_PATH` env points at an existing vault on first org
  creation, offer to copy/adopt into `{WORKSPACES_ROOT}/{orgId}/` (one-time migration
  helper in settings or automatic when path is set and org has no `workspace_config`).

## Workspace resolution (replaces P1 env-only)

`resolveWorkspaceConfig(workspaceId)` in `apps/web/server/vault/workspace.ts`:

1. If auth disabled → current env-based config (P1 behaviour).
2. If auth enabled → load `workspace_config` by `organizationId`; verify caller is a
   member with sufficient role; return `{ path, remoteUrl, branch }`.

`writeToWorkspace` and `bootstrapWorkspace` use the same resolver.

## API protection

Nitro middleware `server/middleware/auth.ts`:

- Skip when auth disabled.
- Allow public: `/api/auth/**`, `/login`, `/signup`, static assets.
- `GET /api/notes*`, `/api/graph` → require `note:read` (or auth disabled).
- `PUT|POST /api/notes*` → require `note:write`.
- `GET /api/sync-status` → require `note:read` for active workspace.
- Workspace management routes → require `workspace:manage`.

Active workspace id: session cookie / header `X-Workspace-Id` (validated membership).

## GitHub hybrid sync

When `workspace_github_link` exists:

1. **Triggers:** link created, cron every 1h, manual “Sync now” in settings.
2. **Fetch** collaborators via GitHub REST (`GET /repos/{owner}/{repo}/collaborators`).
3. **Upsert** members with `source: github`, mapping:
   - `pull` → `read`
   - `push`, `maintain` → `write`
   - `admin` → `owner`
4. **Skip** members where `member_sync_meta.localOverride === true`.
5. **Manual invites** remain (`source: manual`); never deleted by sync.
6. GitHub users without a Fluffmind account: invitation email via organization plugin
   (pending until they sign up and link GitHub account).

OAuth GitHub (login) is separate from the sync token (PAT or owner-authorized OAuth
token stored per workspace in settings).

## UI (minimal P2)

| Route | Purpose |
|-------|---------|
| `/login` | Email + GitHub sign-in |
| `/signup` | First-user bootstrap → admin |
| `/settings/workspace` | Members, invites, GitHub link, sync now |
| Shell | Workspace switcher when user has multiple orgs |

Use `@fluffmind/design-system` components (composition API, typed props).

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | For auth | Postgres connection string |
| `AUTH_DISABLED` | No | `true` forces P1-style no-auth |
| `WORKSPACES_ROOT` | No | Default `/data/workspaces` |
| `BETTER_AUTH_SECRET` | When auth on | Random 32+ bytes |
| `BETTER_AUTH_URL` | When auth on | Public app URL |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | When auth on | OAuth login |
| `VAULT_PATH` | Legacy / dev | Used when auth disabled; optional adoption source |

Update `.env.example`, `docker-compose.yml`, `docker-compose.coolify.yml`.

## DESIGN.md amendment

Replace the “GitHub is the source of truth while linked — no parallel manual editing”
bullet with:

> When linked to GitHub, collaborator roles are synced automatically. Owners may also
> invite members manually (`source: manual`) and pin roles (`localOverride`) so sync
> does not overwrite them.

## Delivery slices (implementation order)

1. **DB + Better Auth foundation** — `packages/db`, migrations, Nuxt handler
2. **Auth optional + bootstrap** — middleware, first-admin, login/signup UI
3. **Multi-workspace vault** — `workspace_config`, resolver, `WORKSPACES_ROOT`
4. **Roles + invitations** — custom AC, invite flow, API guards
5. **GitHub sync** — link UI, collaborator sync, cron, hybrid metadata

## Out of scope (P2)

- Block editor (P3)
- MCP (P5)
- Distributed lock across instances (P7)
- Full email delivery infrastructure (log invitation links in dev; SMTP env for prod)

## Testing strategy

- Unit: role AC `authorize()` matrix, GitHub permission mapping
- Integration: auth disabled → P1 APIs still work; auth enabled → 401 without session
- Manual: two users, invite, read-only cannot PUT, owner can sync GitHub
