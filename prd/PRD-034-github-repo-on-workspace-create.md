# PRD-034 — Create GitHub repo when creating a workspace

- **Status**: in progress
- **Date**: 2026-07-27
- **Tags**: #product #auth #github #workspaces
- **Depends on**: [[PRD-033-github-app-installations|PRD-033]], [[../foam/decisions/ADR-009-github-app-installations|ADR-009]]
- **Design spec**: `docs/superpowers/specs/2026-07-27-github-repo-on-workspace-create-design.md`
- **Plan**: [[../plans/PLAN-034-github-repo-on-workspace-create|PLAN-034]] · `docs/superpowers/plans/2026-07-27-github-repo-on-workspace-create.md`
- **ADR**: extends ADR-009 (no new ADR; credential model unchanged)

## Problem

PRD-033 lets owners **link** an existing GitHub repository to a workspace via App
installation tokens. Creating the empty repo still happens outside Fluffmind
(GitHub UI / CLI). For org onboarding that is friction: every new vault needs a
manual `acme/…` repo before Fluffmind can bind and push.

## Goals

- [ ] At workspace creation, optionally **create** a GitHub repository via the
      installed App, then link it (`authMode=app`) without a PAT
- [ ] Checkbox defaults **on** when App is configured and ≥1 installation exists;
      otherwise hidden / unavailable
- [ ] User can set repo **name**, **visibility**, and **installation**; default
      name `fluff-<workspace-slug>`
- [ ] If GitHub create fails: **keep the workspace**, surface error, allow retry
      from Settings
- [ ] Extend `POST /api/workspaces` (single request); add Settings retry endpoint
- [ ] Document required App permission: Repository **Administration** Read & write

## Non-goals

- Creating repos via PAT
- GitHub templates, topics, teams, transfer, or monorepo layouts
- Auto-create on onboarding-only path without explicit user choice when App unset
- Changing 1 workspace ↔ 1 repo binding (ADR-009)
- Deleting GitHub repos from Fluffmind
- Non-GitHub forges

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Workspace owner | Creates workspace `Handbook`, keeps checkbox on → GitHub gets `acme/fluff-handbook` (private) and workspace is linked |
| Owner (multi-install) | Picks which GitHub org/user installation owns the new repo |
| Owner (GitHub fails) | Name taken / missing Administration → workspace still usable; Settings shows retry « Créer un dépôt » |
| Operator | Updates GitHub App permissions to Administration R/W and re-approves the install |
| Owner (no App) | Sees current create flow; links later via existing App/PAT UI |

## Requirements

### Functional

- [ ] `POST /api/workspaces` accepts optional `createGithubRepo: { installationId, name?, private? } | false`
- [ ] Default repo name server-side: `fluff-<slug>` when `name` omitted
- [ ] Default visibility: private (`private: true`)
- [ ] On success: create repo (`auto_init: true`), upsert `workspace_github_link` (`authMode=app`), set `gitRemoteUrl`
- [ ] On GitHub failure after workspace create: HTTP success for workspace + `github: { ok: false, message }`
- [ ] `POST /api/workspaces/github/create-and-link` for retry on an existing unlinked (or unlink-first) workspace
- [ ] UI create form: checkbox + installation select + name + private toggle when App ready
- [ ] Settings: « Créer un dépôt » when App ready and workspace not App-linked
- [ ] Org vs user installation uses the correct GitHub create endpoint

### Non-functional

- [ ] Clear ASCII `statusMessage` + detailed `message` on hard failures (400/403)
- [ ] README / `.env.example` / operator docs list Administration R/W alongside Contents
- [ ] Existing create-without-GitHub and PAT link paths remain unchanged

## Related project memory

- ADRs: [[../foam/decisions/ADR-009-github-app-installations|ADR-009]], [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]], [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]]
- Prior: [[PRD-033-github-app-installations|PRD-033]]
- Design: `docs/superpowers/specs/2026-07-27-github-repo-on-workspace-create-design.md`

## Resolved during design

| Topic | Choice |
| ----- | ------ |
| When | At workspace creation (checkbox; default on if App + installation) |
| Naming | Form with default `fluff-<slug>`; visibility + installation selectable |
| Failure | Keep workspace; error + Settings retry |
| Approach | Extend `POST /api/workspaces` (not client double-call / async job) |
| Permission | Repository **Administration: Read and write** (required for `POST /orgs/{org}/repos`) |
| Empty repo | `auto_init: true` (minimal README) so clone works immediately |

## Success metrics

- Owner with App installed creates workspace + GitHub repo in one submit, then pushes a note without pasting a PAT
- Forced GitHub failure (duplicate name) still yields a usable local workspace and a clear retry path
- Instance without App: create UI unchanged; no new required fields

## Implementation pointer

Detailed plan: `docs/superpowers/plans/2026-07-27-github-repo-on-workspace-create.md`  
Pointer: [[../plans/PLAN-034-github-repo-on-workspace-create|PLAN-034]]
