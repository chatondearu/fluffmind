# Create GitHub repo on workspace create — Design

**Date:** 2026-07-27  
**Status:** approved (product design)  
**PRD:** `prd/PRD-034-github-repo-on-workspace-create.md`  
**ADR:** extends `foam/decisions/ADR-009-github-app-installations.md` (no new ADR)

## Problem

PRD-033 links workspaces to **existing** GitHub repositories via installation tokens.
Owners still create empty repos outside Fluffmind. Org onboarding needs: create
workspace → create private repo under the installed org → link (`authMode=app`) in
one flow.

## Goals

1. Optional GitHub repo create at workspace creation (App path only).
2. Default UX: checkbox on when App configured + ≥1 installation; name `fluff-<slug>`; private.
3. Soft-fail: workspace always kept if GitHub fails; Settings retry.
4. Single-request create via extended `POST /api/workspaces`.
5. Document Repository **Administration** Read & write on the instance GitHub App.

## Non-goals

- PAT-based repo creation
- Templates / topics / teams / transfers
- Multi-repo workspaces
- Deleting repos from Fluffmind
- Async job / background create

## Decisions

| Topic | Choice |
| ----- | ------ |
| Timing | At workspace create (checkbox); default on iff App + installation |
| Naming / visibility | Editable form; default `fluff-<slug>`, private |
| Failure | Keep workspace; `github.ok: false`; retry from Settings |
| Approach | Extend `POST /api/workspaces` |
| Retry API | `POST /api/workspaces/github/create-and-link` |
| Empty repo | `auto_init: false` (first Fluffmind push creates the branch; avoids README conflicts) |
| Auth model | Unchanged ADR-009 (`authMode=app` + installation token) |

## Architecture

```
POST /api/workspaces { name, slug?, createGithubRepo? }
        │
        ├─► Better Auth createOrganization + vault mkdir + workspace_config
        │
        └─► if createGithubRepo
                │
                ├─ mint installation access token
                ├─ POST /orgs/{org}/repos  OR  POST /user/repos
                │     (name, private, auto_init: true)
                ├─ upsert workspace_github_link (authMode=app)
                └─ set workspace_config.gitRemoteUrl
                     │
                     └─ on GitHub error: still 200 for workspace + github: { ok: false }
```

Settings retry reuses the same create+link core for an existing active workspace.

## API

### Extend `POST /api/workspaces`

**Body (additive):**

```ts
{
  name: string
  slug?: string
  logo?: string | null
  gitBranch?: string
  gitRemoteUrl?: string | null  // existing; ignore when createGithubRepo succeeds
  createGithubRepo?: {
    installationId: string
    name?: string       // default fluff-<slug>
    private?: boolean   // default true
  } | false
}
```

**Response (additive):**

```ts
{
  organization: { … }
  config: { … }
  github?: {
    ok: true
    owner: string
    repo: string
    htmlUrl: string
  } | {
    ok: false
    message: string
  }
}
```

Hard errors (400/403) when `createGithubRepo` is present but App unset, installation
unknown, or caller lacks owner rights — **before** or **without** leaving a half-linked
state. Soft errors only after the workspace row exists.

### `POST /api/workspaces/github/create-and-link`

Same `createGithubRepo` shape (minus workspace identity: uses active workspace).
Requires owner. Refuses if already linked to a different repo (caller must unlink
first via existing unlink flow if any; otherwise 409 with clear message).

## Integrations helper

`@fluffmind/integrations`:

```ts
createGithubRepository({
  token: string
  accountLogin: string
  accountType: 'Organization' | 'User'
  name: string
  private: boolean
  autoInit?: boolean  // default true
}): Promise<{ owner: string; repo: string; htmlUrl: string; cloneUrl: string }>
```

- Organization → `POST /orgs/{accountLogin}/repos`
- User → `POST /user/repos`
- Surfaces GitHub status + message for mapping to Nitro errors / soft `github.ok: false`

Link persistence should reuse the same upsert path as `link.post.ts` (owner/repo,
`authMode=app`, `installationId`, `gitRemoteUrl` via `buildGitHubHttpsRemoteUrl`).

## Permissions (GitHub App)

| Permission | Access | Why |
| ---------- | ------ | --- |
| Contents | Read & write | clone / commit / push (existing) |
| Metadata | Read | required (existing) |
| Members / collaborators | Read | hybrid sync (existing) |
| **Administration** | **Read & write** | **create org/user repositories** (`POST /orgs/{org}/repos`) |

Operators must update the App and **re-approve** the installation after adding
Administration. Document the sensitivity (create/delete repo capability).

## UI

### Workspace create form

- Show GitHub block only when `GET /api/github/app/status` says configured **and**
  `GET /api/github/installations` is non-empty.
- Checkbox « Créer un dépôt GitHub » default **checked** in that case.
- Fields: installation select (if >1), repo name (prefill `fluff-<slug>`), private toggle.
- On response: if `github?.ok === false`, toast/banner with message + link to Settings.

### Settings `/settings/workspace`

- Keep existing App link + PAT flows.
- If App ready and not linked in `authMode=app`: button « Créer un dépôt » →
  `create-and-link` with the same fields.

## Error handling

| Case | Behavior |
| ---- | -------- |
| App not configured + `createGithubRepo` sent | 400, no workspace if we can validate first; prefer validate before createOrganization when possible |
| Unknown `installationId` | 400 |
| Name conflict / GitHub 422 after workspace exists | 200 + `github.ok: false` |
| Missing Administration permission | 200 + `github.ok: false` (or soft message); README explains permission |
| Already linked (retry) | 409 |
| Network / 5xx from GitHub after workspace exists | 200 + `github.ok: false` |

Prefer: create organization only after validating App/installation when
`createGithubRepo` is requested, so avoid orphan workspaces for **client** mistakes;
still soft-fail for **GitHub** failures after org create.

## Out of scope follow-ups

- Suggest alternate name on conflict
- Restrict Administration via fine-grained “create only” if GitHub adds it later
- Auto-add created repo to installation “selected repositories” when install is
  selective (document: prefer “All repositories”, or user adds the new repo on GitHub)

## Verification

1. App + org install with Administration: create workspace with checkbox → repo exists, link `app`, note push works.
2. Duplicate repo name → workspace OK, `github.ok: false`, Settings retry with new name succeeds.
3. App unset → no GitHub block; `POST` without `createGithubRepo` unchanged.
4. User-account installation creates under user via `POST /user/repos`.
5. Unit tests for `createGithubRepository` URL/body; handler tests for soft-fail vs hard 400.
6. Typecheck + lint on touched packages.

## Relation to ADR-009

Credential resolution, installation storage, and PAT fallback stay. This feature only
adds **repository creation** and requires documenting Administration R/W on the App.
