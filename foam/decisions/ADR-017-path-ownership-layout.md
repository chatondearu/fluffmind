# ADR-017 — Path ownership layout (writers + canonical root)

- **Status**: accepted
- **Date**: 2026-11-14
- **Tags**: #architecture #data #sync

## Context

Live sync will be whole-file replication among peers ([[ADR-016-live-sync-transport|ADR-016]]),
not Git locks. Explore charting chose **layout over locks** so writers rarely
collide. Ticket [#143](https://github.com/chatondearu/fluffmind/issues/143).

FluffMind keeps Foam-like notes at vault root and must support human devices
and agents as distinct writers without silent clobbering of canonical pages.

## Decision

1. **Writer unit** = an identity `device:…`, `agent:…`, or hosted `user:…`
   (not “user folds agents into one folder”). Each writer may mutate only under
   `writers/<kind>/<id>/` where `<id>` is a sanitized segment (`[A-Za-z0-9._-]+`).
   Logical form `kind:id` maps to that path prefix (implemented in
   `apps/web/server/vault/writer-prefix.ts`).
2. **Canonical / shared pages** live at the **vault root** (and normal Foam
   trees outside `writers/`). Writers do not directly overwrite canonical
   paths; they draft under their prefix and **publish via an explicit merge
   step** (human UI and/or tooling invoked by an agent).
3. **No silent canonical overwrite** by a writer’s sync apply. Whole-file LWW
   applies within a writer’s own prefix; crossing into canonical requires the
   merge step.
4. **[[ADR-012-workspace-content-roots|ADR-012]] stays orthogonal**:
   `contentRoots` still filters the logical vault; ownership rules apply
   *inside* those roots.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| User-only folders; agents write as the user | Agents clobber human drafts; harder audit |
| Device-only; agents pretend to be devices | Blurs agent vs machine; same clobber risk |
| Everything under `shared/` only | Breaks familiar Foam root UX |
| No shared zone (all path-owned) | Weak “project memory” surface for wiki/graph |
| Auto-merge into canonical when no path clash | Silent publish; surprising for memory vaults |
| Replace content roots with writers layout | Unrelated concern (monorepo subset vs ownership) |

## Consequences

- **Positive**: Conflicts become rare by construction; agent dumps stay
  quarantined; root stays the human-facing wiki.
- **Negative**: Publish/merge UX must exist; wiki-links from `writers/…` into
  root (and back) need clear conventions; migration of today’s flat vaults is
  a follow-on.
- **Constraint**: Sync PRD and implementation must enforce write prefixes;
  host hub replica must not grant “server wins” on canonical paths
  ([[ADR-016-live-sync-transport|ADR-016]]).

## References

- Explore: [#141](https://github.com/chatondearu/fluffmind/issues/141),
  [#143](https://github.com/chatondearu/fluffmind/issues/143)
- [[../architecture/rethink-sync|Rethink sync]]
- Unblocks: [#144](https://github.com/chatondearu/fluffmind/issues/144),
  [#147](https://github.com/chatondearu/fluffmind/issues/147)
