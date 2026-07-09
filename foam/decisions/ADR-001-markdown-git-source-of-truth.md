# ADR-001 — Markdown + Git as the only note source of truth

- **Status**: accepted
- **Date**: 2026-07-06
- **Tags**: #architecture #data

## Context

PKM tools often trap content in proprietary databases. Fluffmind targets Foam/Obsidian
users who expect portable markdown vaults and Git history.

## Decision

Plain markdown files with frontmatter, stored in a Git repository, are the **only**
source of truth for note content. Postgres (P2+) holds identity, workspace membership,
and sync bookkeeping — never note bodies.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Postgres as primary note store | Breaks editor portability and Git-based workflows |
| Dual-write DB + files | Sync complexity and conflict surface |

## Consequences

- **Positive**: No lock-in; vaults open in VS Code/Obsidian; Git diffs are human-readable.
- **Negative**: Query/index features must be rebuilt from files (in-memory index today).
- **Constraint**: Any new feature that persists data must go through Git-backed files or explicit metadata tables only.

## References

- `DESIGN.md` § Founding principle
- Epic [#29](https://github.com/chatondearu/fluffmind/issues/29) (P0)
