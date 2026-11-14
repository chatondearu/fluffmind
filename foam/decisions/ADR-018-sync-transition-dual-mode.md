# ADR-018 — Sync transition: dual-mode then supersede live Git

- **Status**: accepted
- **Date**: 2026-11-14
- **Tags**: #architecture #data #sync #deployment

## Context

Target live sync is mesh peers + path ownership ([[ADR-016-live-sync-transport|ADR-016]],
[[ADR-017-path-ownership-layout|ADR-017]]). Today’s shipped path is server-side Git
writer + distributed lock ([[ADR-002-server-side-git-sync|ADR-002]],
[[ADR-007-distributed-workspace-lock|ADR-007]]). Explore ticket
[#144](https://github.com/chatondearu/fluffmind/issues/144): how the upcoming
PRD migrates without stranding Coolify/hosted vaults, while keeping solo +
hosted in one redesign.

## Decision

1. The **first sync PRD** covers **solo/portable and hosted**, with an explicit
   **dual-mode period**:
   - **Legacy**: ADR-002/007 remain the live write path for not-yet-migrated
     workspaces.
   - **New**: mesh live sync per ADR-016/017 for opted-in / new vaults.
2. A workspace on the **new protocol** must **not** use Git as a live writer
   (no dual live writers). Git stays available as **export / backup / GitHub
   interop** only for those vaults. Unmigrated vaults keep Git-live until
   migrated.
3. After migration completes for a deployment, ADR-002 is **superseded as the
   live-sync path** (Git no longer live). Document that supersession in the
   PRD/plan checklist; do not flip ADR-002 status until migration is real.
4. **ADR-007 is not deleted with live Git**: workspace locks remain available
   for **non-live** server jobs that still need disk serialization (admin
   dangerous ops, Git export/backup jobs, seed, etc.). Locks are out of the
   mesh live path (ownership + LWW instead).

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Hard cut mesh-only in first PRD | Too risky for existing hosted data |
| Solo/portable PRD first; hosted later | Contradicts charting (solo+hosted one redesign); leaves lock pain longest |
| Keep Git as live fallback when mesh is down | Two live sources of truth |
| Supersede ADR-007 entirely with mesh | Still need serialization for admin/export Git jobs |

## Consequences

- **Positive**: One PRD story; safe rollout; clear “no double live writer” rule.
- **Negative**: Dual-mode code and migration UX until legacy drains; longer
  time with two mental models.
- **Constraint**: PRD must define migrate/opt-in mechanics and forbid enabling
  mesh live + Git live on the same workspace.

## References

- Explore: [#141](https://github.com/chatondearu/fluffmind/issues/141),
  [#144](https://github.com/chatondearu/fluffmind/issues/144)
- [[ADR-002-server-side-git-sync|ADR-002]], [[ADR-007-distributed-workspace-lock|ADR-007]]
- [[ADR-016-live-sync-transport|ADR-016]], [[ADR-017-path-ownership-layout|ADR-017]]
- Fog item remaining: concrete migration steps for existing Git-synced workspaces
