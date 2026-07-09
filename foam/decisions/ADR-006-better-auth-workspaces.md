# ADR-006 — Better Auth organizations with hybrid GitHub permission sync

- **Status**: accepted
- **Date**: 2026-07-09
- **Tags**: #architecture #auth

## Context

P2 requires multi-account workspaces, roles (`read` / `write` / `owner`), and optional
GitHub collaborator alignment — while preserving P1’s server-only Git writes and
auth-off local dev.

## Decision

- **Auth stack:** Better Auth + Drizzle + Postgres (`packages/db`), organization plugin
  with `createAccessControl` custom roles.
- **Vault paths:** `{WORKSPACES_ROOT}/{organizationId}/` via `workspace_config` table.
- **Auth optional:** `AUTH_DISABLED=true` or missing `DATABASE_URL` → P1 `VAULT_PATH` behaviour.
- **GitHub permissions:** Hybrid sync — auto-map collaborators when linked; manual
  invites with `localOverride` pins are never overwritten by sync.
- **Bootstrap:** First user on an instance becomes admin; no separate setup wizard.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Hand-rolled workspace schema | Reinvents Better Auth organization plugin |
| GitHub-only permission source | Blocks manual invites and role overrides |

## Consequences

- **Positive**: Matches self-hosted + GitHub-collab workflows; dev stays simple without DB.
- **Negative**: Encrypted sync tokens, cron sync, invitation email infra (SMTP prod).
- **Constraint**: Note APIs must check organization roles when auth is enabled.

## References

- [[../../prd/PRD-023-p2-auth-workspaces|PRD-023]]
- `docs/superpowers/specs/2026-07-09-p2-auth-workspaces-design.md`
- PR [#54](https://github.com/chatondearu/fluffmind/pull/54)
- Epic [#23](https://github.com/chatondearu/fluffmind/issues/23) (closed)
