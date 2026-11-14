# PRD-042 — Sync rethink (mesh peers, path ownership)

- **Status**: approved
- **Date**: 2026-11-14
- **Approved**: 2026-11-14
- **Tags**: #product #architecture #data #sync
- **GitHub**: Explore map [#141](https://github.com/chatondearu/fluffmind/issues/141)
- **Depends on**: [[../foam/decisions/ADR-016-live-sync-transport|ADR-016]],
  [[../foam/decisions/ADR-017-path-ownership-layout|ADR-017]],
  [[../foam/decisions/ADR-018-sync-transition-dual-mode|ADR-018]],
  [[../foam/decisions/ADR-019-hosted-multi-browser-coherence|ADR-019]]
- **Plan**: [[../plans/PLAN-042-sync-rethink|PLAN-042]]
- **Origin**: [[../foam/architecture/rethink-sync|Rethink sync]]

## Problem

FluffMind is meant to open, edit, and browse Markdown memory (project Foam vaults
or agent memory) with a Notion-like UX while keeping Foam strengths (raw MD,
graph, global node). Live sync today is **server-side Git** as the write path
([[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]]) plus distributed
locks ([[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]]). That
stack drove ops complexity (admin repair, stale index, lock timeouts) instead of
product work.

Users need:

- **Clients** that attach one or more local vault folders (projects)
- An optional **host** where those projects appear synchronized
- Coherent multi-browser / multi-member hosted editing **without** treating the
  server as a content master

## Goals

- [x] Replace **live** Git writes on mesh-live with file persist (no live
      commit/push); Git remains history / backup / GitHub interop only
      _(T1–T2; full mesh/peer transport + relay still T8)_
- [x] Ship **one redesign** for portable/solo **and** hosted multi-workspace
      _(hosted T5–T6; portable daemon T7; stub transport T8)_
- [x] Enforce **path ownership**: drafts under `writers/<device|agent|user>/`;
      canonical pages at vault root only via **explicit merge/publish**
      _(T3–T4)_
- [x] Hosted web: thin client → instance sync peer (HTTP/WS); portable: thin UI →
      local daemon; same protocol underneath
      _(hosted WS + writer T5–T6; daemon HTTP T7; in-memory mesh stub T8 — iroh deferred)_
- [x] Dual-mode migration: legacy Git-live workspaces coexist until opted in /
      migrated; **never** enable Git-live and mesh-live on the same vault
      _(T1 + GET/PATCH sync-mode T9)_
- [x] Preserve one vault abstraction (Foam or agent memory); provenance is metadata
- [x] Keep derived search/note index policy (already RAM-from-files)

## Non-goals

- Character-level CRDT / same-note realtime collab (Loro) in this PRD
- Picking concrete mesh library / Rust-vs-Node runtime (plan + later ADR; explore 6C)
- Dimensioning the sync engine for Neomind (soft compatibility only)
- Replacing the block editor or [[../foam/decisions/ADR-008-inline-rich-contenteditable|ADR-008]]
- Deleting ADR-007: locks stay for **non-live** server jobs (admin, Git export, seed)
- Hard-cut migration with no dual-mode
- Browser-only P2P without host/daemon facade
- Changing ADR-001 (Markdown files as source of truth) or ADR-012 (content roots
  remain orthogonal filters)

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Solo / portable user | Runs local daemon + UI; attaches several vault folders; devices sync as peers; optional host hub mirrors them |
| Hosted member (Coolify) | Edits in browser without installing a daemon; writes draft under `writers/user:<id>/`; publishes to root via explicit merge; other browsers get WS invalidate |
| Agent writer | Writes under `writers/agent:<id>/`; never silently overwrites canonical root |
| Operator | Migrates a workspace from Git-live to mesh during dual-mode; can still Git-export / backup; admin jobs still use locks where needed |

## Requirements

### Functional

- [x] **Live sync protocol** is peer replication of vault files (whole-file LWW per
      path), not `writeToWorkspace` Git commit/push as the live path (ADR-016)
      _(mesh-live skips Git — T2; `MeshSyncTransport` in-memory stub — T8; iroh later)_
- [x] **Writer prefixes** enforced on apply: `device:…`, `agent:…`, and hosted
      `user:…` (ADR-017, ADR-019) _(T3, T6)_
- [x] **Canonical publish** API/UX: promote from writer prefix → vault root only
      via explicit merge; no silent root overwrite from sync apply _(T4)_
- [x] **Portable facade**: local daemon + thin web UI _(daemon HTTP T7; Nuxt↔daemon wiring thin/follow-up)_
- [x] **Hosted facade**: browsers talk to instance sync peer over HTTP/WS; host is
      hub **replica**, not content master (ADR-016, ADR-019) _(T5–T6)_
- [x] **WS (or equivalent) push** so other browsers reload/invalidate on file change
      _(T5)_
- [x] **Dual-mode**: per-workspace flag/mode — legacy Git-live vs mesh-live;
      mutually exclusive live writers (ADR-018) _(T1 + T9)_
- [x] **Git export/backup/GitHub interop** remains available for mesh vaults
      without becoming live write _(mesh-live skips live Git; export path unchanged)_
- [x] **ADR-012 content roots** still filter logical vault; ownership applies inside
- [x] Opt-in / migrate path documented for existing Git-synced workspaces (UX
      detail in plan) _(T9 settings + API)_

### Non-functional

- [x] No double live source of truth (Git + mesh) on one workspace _(mode seam T1)_
- [x] Relay acceptable for NAT/browser; pure in-browser Wasm mesh not required _(T8 stub; iroh/relay later)_
- [x] Editor stays free of CRDT (vault-layer sync only)
- [x] Ops: reduce reliance on Git-live repair for mesh vaults; ADR-007 retained for
      non-live jobs only _(mesh-live path; locks kept for admin/export)_
- [x] Soft: avoid hard dependency on Neomind’s sync stack

## Related project memory

- Explore map: [#141](https://github.com/chatondearu/fluffmind/issues/141)
- [[../foam/architecture/rethink-sync|Rethink sync]]
- [[../foam/decisions/ADR-016-live-sync-transport|ADR-016]] Live sync transport
- [[../foam/decisions/ADR-017-path-ownership-layout|ADR-017]] Path ownership layout
- [[../foam/decisions/ADR-018-sync-transition-dual-mode|ADR-018]] Dual-mode transition
- [[../foam/decisions/ADR-019-hosted-multi-browser-coherence|ADR-019]] Hosted browsers
- Supersede-pending live path: [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]]
- Locks retained non-live: [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]]
- [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]],
  [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]]
- Research branches: `research/peervault-iroh-loro`, `research/derived-search-index`
- Vision: [[../foam/product/vision|Vision]] (mesh peers destiny; Git = backup/interop)

## Open questions

1. Exact dirname encoding for `writers/<id>/` (escaping user/agent ids)
2. Concrete mesh library + runtime (iroh / other; Node vs Rust daemon)
3. Migrate/opt-in UX copy and rollback rules for dual-mode
4. Whether portable package (PRD-032) gains a bundled/sidecar daemon in the same
   milestone or a follow-up
5. Graph / global-node indexing changes beyond today’s derived Maps (if any)

## Success metrics

- A vault on mesh-live never performs Git commit/push on ordinary note save
- Two hosted members can edit under their own writer prefixes without lock 503s
- Publishing to root requires an explicit user/agent action; sync alone cannot
  clobber canonical paths
- Operator can leave a workspace on Git-live during dual-mode without breakage
- Portable multi-device sync works with host optional (hub replica when present)

## Implementation pointer

`plans/PLAN-042-sync-rethink.md` via `cda-plan` after this PRD is **approved**.
