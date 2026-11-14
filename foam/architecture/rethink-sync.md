# Rethink: simplify sync (Rust + mesh)

#architecture #data

- **Status**: implementing — [[../../prd/PRD-042-sync-rethink|PRD-042]] /
  [[../../plans/PLAN-042-sync-rethink|PLAN-042]] (map [#141](https://github.com/chatondearu/fluffmind/issues/141))
- **Date**: 2026-10-31 (charted 2026-11-13; implementing 2026-11-14)
- **Origin**: owner note while designing a decentralized agent with shared memory

## Progress (PLAN-042)

- **Done (T1–T6):** sync mode seam (`git-live` | `mesh-live`); mesh-live note save
  without live Git; writer prefix enforcement; canonical publish; hosted WS
  invalidate; hosted writer = workspace member (`user:<id>`).
- **Remaining (T7–T10):** portable daemon facade; transport spike / peer exchange;
  dual-mode migrate UX; docs & foam (this note + vision/PRD ticks).

## Locked so far

- Destination: PRD for sync rethink (solo + hosted together) — **approved**
- Git = history/backup/GitHub interop only
- Runtime (Rust vs Node) deferred
- One vault abstraction (Foam or agent memory); shared engine with agents = soft only
- **Live transport:** [[../decisions/ADR-016-live-sync-transport|ADR-016]] — mesh peers +
  relay; host = hub replica; portable daemon / hosted WS peer; whole-file LWW
- **Path ownership:** [[../decisions/ADR-017-path-ownership-layout|ADR-017]] —
  `writers/<device|agent|user>/` drafts; canonical at vault root via explicit merge;
  ADR-012 content roots orthogonal
- **Transition:** [[../decisions/ADR-018-sync-transition-dual-mode|ADR-018]] —
  dual-mode (legacy Git-live vs mesh); no double live writer; ADR-007 kept for
  non-live server jobs
- **Hosted browsers:** [[../decisions/ADR-019-hosted-multi-browser-coherence|ADR-019]] —
  writer = workspace member; canonical via merge; WS invalidate; no same-file
  collab guarantee

## Why

Fluffmind is meant to replace Notion, but the Git layer grew too complex. Server-side
single writer ([[../decisions/ADR-002-server-side-git-sync|ADR-002]]) needed a distributed
lock ([[../decisions/ADR-007-distributed-workspace-lock|ADR-007]]), Postgres, a GitHub App
([[../decisions/ADR-009-github-app-installations|ADR-009]]) and a stack of admin repair
tools ([[../decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]],
[[../decisions/ADR-014-admin-github-panel|ADR-014]]: reset-hard, orphan vault rebind,
stale index invalidation, session repair). Most recent work fixes sync, not the product.

## Directions to evaluate

1. **Avoid conflicts by layout, not by locks.** Each writer owns its own paths (one folder
   per device/agent); shared pages only through an explicit merge step. Plain
   `git pull --rebase` then cannot conflict.
2. **Derived index, never stored.** Always rebuild the search index locally from files.
3. **Rust sync engine** as a small daemon/binary instead of Node + server orchestration.
4. **Mesh sync** for multi-device without a central server: [iroh](https://docs.iroh.computer/)
   (P2P QUIC, relay fallback) + a CRDT ([Loro](https://loro.dev/) or `iroh-docs`) for
   pages edited by several people. Prior art: [peervault](https://github.com/robcohen/peervault)
   (Loro + iroh, Obsidian vaults). First PRD uses whole-file LWW; CRDT stays a later option.
5. Keep Git as **history/backup and GitHub interop**, not as the live sync protocol.

## Open questions (PRD / later)

- Concrete mesh library + runtime (T8 spike)
- Which pages, if any, later need CRDT (out of first PRD)
- Migrate/opt-in UX details (T9; strategy in ADR-018)

Portable thin UI ↔ daemon and hosted multi-user are **in scope** (ADR-016, ADR-019).

Related: the decentralized agent project may share the same sync engine (**soft** only).
