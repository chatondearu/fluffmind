# GitHub App installations (self-hosted) — Design

**Date:** 2026-07-24  
**Status:** approved (product design)  
**PRD:** `prd/PRD-033-github-app-installations.md`  
**ADR:** `foam/decisions/ADR-009-github-app-installations.md` (proposed)

## Problem

P2 links a workspace to GitHub with a pasted PAT (`workspace_github_link.syncToken`). That
blocks clean multi-repo organization setups. Identity already uses a GitHub OAuth App;
repo access should use a **GitHub App installation** owned by each self-hosted instance.

## Goals

1. Per-instance GitHub App credentials (no official Fluffmind marketplace App in v1).
2. One installation → many workspaces; one workspace → one repo.
3. Installation tokens for collaborator sync + git HTTPS.
4. PAT remains fallback (coexistence).
5. Preserve ADR-006 hybrid role sync.

## Non-goals

- SaaS single App for all tenants
- Multi-repo per workspace
- Replacing OAuth login
- Forced PAT migration
- Non-GitHub forges

## Decisions

| Topic | Choice |
| ----- | ------ |
| Who owns the App | Each self-hosted instance (operator creates App) |
| PAT | Coexistence; App preferred when linked in `app` mode |
| Binding model | 1 GitHub installation → N Fluffmind workspaces; 1 workspace → 1 repo |
| Approach | App supplies credentials for API + git (not collab-only) |
| Installation storage | **Instance-scoped** table; any `workspace:manage` owner may bind a repo from a recorded installation |
| Token storage | Mint installation access tokens on demand; short memory cache OK; do not persist long-lived installation tokens |
| Login OAuth | Unchanged (`GITHUB_CLIENT_ID` / `SECRET`) |

## Architecture

```
Operator env
  GITHUB_APP_ID + PRIVATE_KEY + WEBHOOK_SECRET (+ install OAuth client if needed)
        │
        ▼
GitHub App (per Fluffmind deploy)
        │  install on org/user
        ▼
github_app_installation (DB, instance-scoped)
        │
        ├── workspace A → repo acme/handbook  (authMode=app)
        └── workspace B → repo acme/rfcs      (authMode=app)

workspace C → still PAT (authMode=pat) if preferred / App unset
```

**Credential resolution** (per workspace, for GitHub API + git remote auth):

1. `authMode=app` + valid `installationId` → installation access token (optionally restricted to that repo)
2. Else encrypted `syncToken` (PAT) if present
3. Else no GitHub credentials (local git only / unauthenticated remote fails)

## Data model

### `github_app_installation` (new)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | text PK | Internal id |
| `installationId` | bigint/text unique | GitHub installation id |
| `accountLogin` | text | Org or user login |
| `accountType` | text | `Organization` \| `User` |
| `createdAt` / `updatedAt` | timestamp | |

### `workspace_github_link` (extend)

| Column | Change |
| ------ | ------ |
| `authMode` | `app` \| `pat` (default `pat` for existing rows) |
| `installationId` | nullable FK/logical ref to GitHub installation id |
| `syncToken` | nullable when `authMode=app` |
| `owner` / `repo` | unchanged |

## Permissions (GitHub App)

| Permission | Access | Why |
| ---------- | ------ | --- |
| Contents | Read & write | clone / commit / push |
| Metadata | Read | required |
| Members (or Collaborators via repo API) | Read | hybrid member sync |
| Webhooks | push, installation, installation_repositories | sync working copy + installation inventory |

Exact Collaborators vs Members scope must be validated against
`packages/integrations/src/github/collaborators.ts` during implementation.

## API / UI (sketch)

| Surface | Role |
| ------- | ---- |
| `GET /api/github/app/status` | App env configured? |
| Install URL / callback | Record `github_app_installation` |
| `GET /api/github/installations` | List installations |
| `GET /api/github/installations/:id/repos` | Repos available to bind |
| `POST /api/workspaces/github/link` | `{ mode: 'app'\|'pat', repository, syncToken? }` |
| Webhook handler | Extend existing `webhooks/github` for installation events |
| `/settings/workspace` | App bind UI + PAT fallback + mode badge |
| Operator docs | How to create the App + required env |

## Flows

### Operator setup

1. Create GitHub App with permissions above; webhook → Fluffmind `/api/webhooks/github`.
2. Set env on the instance; restart.
3. Status endpoint / settings shows “App configured”.

### Install + bind

1. Owner starts install → GitHub selects account + repo access.
2. Callback stores installation.
3. In a workspace, owner picks one repo → `authMode=app`, sets `gitRemoteUrl`, clears need for PAT.
4. Sync now / cron / push path mint installation tokens as needed.

### Uninstall

- GitHub `installation` deleted webhook → mark/remove installation; workspaces on that
  installation lose App auth (surface error; PAT can be re-added).

## Relation to ADR-006

ADR-006 hybrid sync rules stay. This design **extends** the credential source for
GitHub API/git from “PAT only” to “App preferred, PAT fallback”. ADR-009 records that
extension; ADR-006 is not fully superseded.

## Out of scope follow-ups

- Official Fluffmind SaaS App / marketplace
- Per-Fluffmind-org isolation of installations (multi-tenant SaaS hardening)
- Automatic PAT → App migration wizard

## Verification

1. Fresh instance: configure App → install → bind two workspaces to two repos → sync + write.
2. App env unset: PAT link path unchanged.
3. Uninstall App on GitHub: workspaces fail closed with clear error; PAT re-link works.
4. `localOverride` members unchanged by sync.
5. Typecheck + targeted tests for credential resolution and webhook install events.
