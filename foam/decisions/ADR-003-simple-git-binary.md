# ADR-003 — Use simple-git (host `git` binary), not isomorphic-git

- **Status**: accepted
- **Date**: 2026-07-07
- **Tags**: #architecture #deployment

## Context

Reliable rebase-on-rejected-push is critical for the single-writer sync model.

## Decision

Use `simple-git` (shells out to the real `git` binary). Docker images install `git`
(`apk add git`). Server commits set explicit `user.name` / `user.email` per repo —
no reliance on a human global git config.

Commits always happen **before** push is attempted so rejected pushes never lose local commits.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| isomorphic-git | Weaker rebase/conflict behaviour in production |

## Consequences

- **Positive**: Battle-tested Git semantics.
- **Negative**: Runtime must ship the `git` binary; slightly heavier container.

## References

- `DESIGN.md` § Git sync
- Issue [#46](https://github.com/chatondearu/fluffmind/issues/46)
