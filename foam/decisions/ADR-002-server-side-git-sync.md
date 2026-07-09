# ADR-002 — Server-side Git sync (single writer per workspace)

- **Status**: accepted
- **Date**: 2026-07-07
- **Tags**: #architecture #data

## Context

Multi-device and multi-agent writes cannot safely share per-client Git operations on the
same remote vault — concurrent writers risk corruption or endless conflicts.

## Decision

Only the **server** touches Git. One working copy per workspace on persistent disk.
Every write (web UI, future MCP) calls `writeToWorkspace`, which:

1. Acquires a workspace-scoped lock
2. Applies the change and commits locally
3. Pushes and rebases on rejected push
4. Releases the lock and refreshes the read index

Clients are thin HTTP callers, never Git writers.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Client-side Git in browser | Unsafe with multiple tabs/devices |
| isomorphic-git in clients | Same concurrency problems |

## Consequences

- **Positive**: Multi-device “just works”; MCP and UI share one write path.
- **Negative**: MVP assumes single server instance per workspace (P7 for distributed lock).
- **Constraint**: New write features must use `writeToWorkspace`, not direct filesystem Git.

## References

- `apps/web/server/vault/write.ts`, `packages/integrations/src/git.ts`
- PR [#49](https://github.com/chatondearu/fluffmind/pull/49), [#53](https://github.com/chatondearu/fluffmind/pull/53)
- Epic [#22](https://github.com/chatondearu/fluffmind/issues/22)
