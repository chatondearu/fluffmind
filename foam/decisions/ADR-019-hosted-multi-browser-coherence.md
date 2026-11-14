# ADR-019 — Hosted multi-browser vault coherence

- **Status**: accepted
- **Date**: 2026-11-14
- **Tags**: #architecture #data #sync #auth

## Context

Hosted web talks to the instance sync peer over HTTP/WS ([[ADR-016-live-sync-transport|ADR-016]])
without a local daemon. Path ownership uses `writers/<id>/` and explicit merge
to canonical root ([[ADR-017-path-ownership-layout|ADR-017]]). Ticket
[#147](https://github.com/chatondearu/fluffmind/issues/147): how multiple
browsers/users stay coherent without Git single-writer locks.

## Decision

1. **Writer identity on hosted web** = workspace **member** (`user:<id>`).
   Multiple tabs/sessions of the same user share that prefix (whole-file LWW
   inside it). Agents remain `agent:<id>`. Portable/daemon peers still use
   `device:<id>` as in ADR-017.
2. **Canonical (vault root) edits** from hosted UI go through the **same
   explicit merge/publish** path as everywhere else — never “direct root write
   because we are on the server.”
3. **Coherence** between browsers: the host peer **pushes** invalidation / file
   updates over WS (or equivalent); clients reload content. No browser CRDT /
   presence cursors in the first sync PRD.
4. **Non-goal**: no promise of conflict-free simultaneous editing of the same
   canonical file; concurrent publishes → last publish wins (LWW). No UI lock
   that blocks a second editor session as the primary coherence mechanism.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Per-tab device writers | Noise prefixes; multi-tab hell |
| Sticky single live editor per workspace | Reintroduces single-writer product model |
| Owners write root directly | Host becomes social master; breaks ADR-017 |
| Canonical read-only on hosted | Breaks Notion-like hosted editing |
| Polling only | Too weak for multi-browser UX |
| Browser CRDT in first PRD | Deferred (ADR-016 granularity) |
| Auto-merge / UI edit locks as primary | Dishonest or lock-shaped |

## Consequences

- **Positive**: One ownership rule across portable and hosted; multi-member
  workspaces map cleanly to writers; WS matches existing facade choice.
- **Negative**: Users must learn publish/merge for canonical pages; concurrent
  canonical publishes can drop a whole file (LWW).
- **Constraint**: Sync PRD must specify member→writer mapping, WS invalidate
  semantics, and the canonical non-goal above.

## References

- Explore: [#141](https://github.com/chatondearu/fluffmind/issues/141),
  [#147](https://github.com/chatondearu/fluffmind/issues/147)
- [[ADR-016-live-sync-transport|ADR-016]], [[ADR-017-path-ownership-layout|ADR-017]],
  [[ADR-018-sync-transition-dual-mode|ADR-018]]
