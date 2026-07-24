# PRD-033 — GitHub App installations (self-hosted)

- **Status**: shipped
- **Shipped**: 2026-07-24 — branch `feat/github-app-installations`
- **Date**: 2026-07-24
- **Tags**: #product #auth #github #self-host
- **Depends on**: ADR-006 (Better Auth + hybrid GitHub sync), P2 workspaces
- **Design spec**: `docs/superpowers/specs/2026-07-24-github-app-installations-design.md`
- **Plan**: [[../plans/PLAN-033-github-app-installations|PLAN-033]] · `docs/superpowers/plans/2026-07-24-github-app-installations.md`
- **ADR**: [[../foam/decisions/ADR-009-github-app-installations|ADR-009]] (accepted)

## Problem

Workspace GitHub linking today requires an owner to paste a **PAT** (`syncToken`) per
repo. That works for solo / small teams but scales poorly for organizations:

- Manual token creation, rotation, and over-broad scopes
- No clean “install once, pick repos” model across many vaults
- Multi-repo orgs mean N secrets and weak auditability

Login via **OAuth App** (`GITHUB_CLIENT_ID` / `SECRET`) already covers identity. Repo
access needs a separate, installation-based credential path.

## Goals

- [x] Each Fluffmind **instance** can configure its **own** GitHub App (self-host)
- [x] One GitHub App **installation** (org or user) can back **N workspaces**
- [x] Each workspace binds **at most one** repository from that installation
- [x] Installation access tokens drive **collaborator sync** and **git clone/push**
- [x] Keep **PAT fallback** when App is unset or owner prefers PAT
- [x] Preserve hybrid role sync (`localOverride`, manual invites) from ADR-006
- [x] Document operator setup (create App, permissions, env, webhook)

## Non-goals

- Single official Fluffmind marketplace App for all tenants (SaaS path later)
- Multiple repos inside one workspace
- Replacing GitHub OAuth login
- GitLab / Forgejo / Gitea Apps
- Forced migration of existing PAT links
- Changing server-only Git writer model (ADR-002)

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Self-host operator | Creates a GitHub App for their Fluffmind deploy; sets env credentials |
| Org admin / workspace owner | Installs the App on `acme`, selects repos, binds `docs` vault to `acme/handbook` and `eng` vault to `acme/rfcs` |
| Existing PAT user | Keeps current link UI; no breakage if App env is empty |
| Member | Unchanged login; roles still sync from collaborators when linked |

## Requirements

### Functional

- [x] Env: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`, webhook secret (`GITHUB_APP_WEBHOOK_SECRET` or `GITHUB_WEBHOOK_SECRET`)
- [x] Persist GitHub installations (`installation_id`, account login/type)
- [x] Settings: App status; install/authorize; list installation repos; bind repo to workspace
- [x] Extend `workspace_github_link` with `authMode` (`app` | `pat`) and optional `installationId`; `syncToken` nullable in app mode
- [x] Credential resolution order per workspace: App installation token → PAT → no GitHub remote auth
- [x] Installation tokens minted on demand (short-lived); not stored as long-lived secrets
- [x] Webhooks: handle `installation` / `installation_repositories` (+ keep `push`)
- [x] Collaborator sync uses the same hybrid rules as today
- [x] Git remote HTTPS uses installation token (or PAT) for `ensureWorkingCopy` / `commitAndPush`

### Non-functional

- [x] Permissions documented and minimal: Contents R/W, Metadata R, Members/collaborators R
- [x] Compose / `.env.example` / Coolify env parity for new variables
- [x] Failures surface clear ASCII `statusMessage` + detailed `message` (existing Nitro convention)

## Related project memory

- ADRs: [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]], [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]], [[../foam/decisions/ADR-009-github-app-installations|ADR-009]]
- Prior product: [[PRD-023-p2-auth-workspaces|PRD-023]]
- Design: `docs/superpowers/specs/2026-07-09-p2-auth-workspaces-design.md`

## Open questions

1. ~~Exact GitHub App permission for collaborator listing~~ — validated: Members/collaborators R documented in operator setup.
2. GitHub issue / milestone assignment when this leaves draft.

## Resolved during design

- Installations are **instance-scoped** (not per Fluffmind org); any `workspace:manage` owner may bind a repo from a recorded installation on that instance.

## Success metrics

- Owner completes App → install → bind → sync + note push **without** pasting a PAT
- Instance with App unset: existing PAT flow still works end-to-end
- Two workspaces on one installation bind two different repos without sharing a PAT

## Implementation pointer

Detailed plan: `docs/superpowers/plans/2026-07-24-github-app-installations.md`  
Pointer: [[../plans/PLAN-033-github-app-installations|PLAN-033]]
