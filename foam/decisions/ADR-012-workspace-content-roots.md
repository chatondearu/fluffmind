# ADR-012 — Workspace content roots (logical vault subset)

- **Status**: accepted
- **Date**: 2026-07-30
- **Tags**: #architecture #data #workspaces

## Context

Workspaces bind 1:1 to a Git remote and keep a full server-side working copy
([[ADR-002-server-side-git-sync|ADR-002]], [[ADR-006-better-auth-workspaces|ADR-006]]).
Some remotes are application monorepos where only selected directories (`foam/`,
`docs/`) should be the PKM vault.

## Decision

- Store `contentRoots: string[]` on `workspace_config` (default `[]` = entire tree).
- Keep cloning the **full** repository; filter index and mutate paths in the vault
  engine (logical roots), not via Git sparse-checkout in v1.
- Note ids remain paths relative to the Git working-copy root.
- Reject writes (and treat reads as missing) outside the configured roots when
  non-empty.
- Set roots at workspace create and/or while still `[]` on first GitHub link;
  no in-place edit API in v1.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Git sparse-checkout | Correct disk savings but higher clone/relink complexity; defer |
| Point `vaultPath` at a single subdirectory | Breaks multi-root and Git root identity |
| Editable roots anytime | Index/migration edge cases; not needed for first ship |

## Consequences

- **Positive**: Monorepo Foam/docs workflows without changing 1 workspace ↔ 1 repo.
- **Negative**: Full tree still on disk; Fluffmind simply ignores non-root paths.
- **Constraint**: New vault entry points (HTTP, MCP, welcome bootstrap) must honor
  `contentRoots`.

## References

- [[../../prd/PRD-038-workspace-content-roots|PRD-038]]
- `docs/superpowers/specs/2026-07-30-workspace-content-roots-design.md`
- `apps/web/server/vault/`, `packages/db/src/schema/workspace.ts`
