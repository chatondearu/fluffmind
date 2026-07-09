# PRD-023 — Auth & workspaces (P2)

- **Status**: shipped
- **GitHub**: [#23](https://github.com/chatondearu/fluffmind/issues/23) (closed)
- **Milestone**: P2 — Auth & workspaces
- **Shipped**: PR [#54](https://github.com/chatondearu/fluffmind/pull/54) (2026-07-09)

## Goal

Introduce multi-account workspaces with Better Auth + Drizzle/Postgres, custom roles
(`read` / `write` / `owner`), member invitations, optional GitHub collaborator sync,
while preserving the P1 guarantee that only the server writes Git.

## Exit criteria

- [x] Invited member can authenticate and access a workspace per role
- [x] Multi-device works (server remains sole Git writer)
- [x] Auth optional for local dev (`AUTH_DISABLED` / no `DATABASE_URL`)

## Scope

- [x] `packages/db` — Drizzle schema, Better Auth, custom roles, workspace extension tables
- [x] Nuxt auth handler, middleware, login/signup/settings UI
- [x] Postgres-backed `resolveWorkspaceConfig` per organization
- [x] Role enforcement on note mutations
- [x] GitHub hybrid collaborator sync
- [x] Env vars documented in `.env.example`, Docker compose files, `DESIGN.md`

## Out of scope (P2)

- Block editor (P3), MCP (P5), distributed lock (P7)
- Full production SMTP (dev: log invitation links)

## Architecture constraints

| ADR | Topic |
| --- | ----- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Notes stay in Git, not Postgres |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | All writes via `writeToWorkspace` |
| [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]] | Better Auth + hybrid GitHub sync |

## Source documents

- Design spec (archive): `docs/superpowers/specs/2026-07-09-p2-auth-workspaces-design.md`
- Implementation plan: [[../plans/PLAN-023-p2-auth-workspaces|PLAN-023]]

## Agent notes

- Priority: P2 (completed)
- Board: epic #23 → **Done**; reconcile #22 P1 epic still **In Progress** on board
