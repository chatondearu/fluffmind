# Sync architecture — portable vs hosted

#architecture #data #sync

- **Status**: reference map for PRD-042 (shipped slices T1–T10 on `main`)
- **Date**: 2026-11-14
- **Resume here** after a long sync session — diagrams + gaps + next moves

Related: [[rethink-sync|Rethink sync]], [[vault-engine|Vault engine]],
[[../../prd/PRD-042-sync-rethink|PRD-042]], [[../../plans/PLAN-042-sync-rethink|PLAN-042]],
[[../decisions/ADR-016-live-sync-transport|ADR-016]] …
[[../decisions/ADR-019-hosted-multi-browser-coherence|ADR-019]],
explore map [#141](https://github.com/chatondearu/fluffmind/issues/141).

## One-line model

**Host** = UI + Nuxt instance (hub replica) + vault + `/ws/vault`.  
**Portable** = UI + local daemon + vault (+ optional host).  
**Both** = drafts under `writers/…`, canonical root only via **publish**, Git = backup
(not live master).

## Facades (portable vs hosted)

```mermaid
flowchart TB
  subgraph Product["FluffMind — Markdown memory"]
    Vault["Vault = .md files\n+ derived graph\n+ writers/… + canonical root"]
  end

  subgraph Portable["Portable / solo"]
    UI1["Thin web UI"]
    Daemon["fluffmind-daemon\nHTTP localhost"]
    UI1 -->|"draft writes"| Daemon
    Daemon --> Vault
  end

  subgraph Hosted["Hosted / Coolify"]
    UI2["Browser UI"]
    Nuxt["Nuxt instance\n+ hub peer"]
    WS["/ws/vault invalidate"]
    UI2 -->|"HTTP notes/publish"| Nuxt
    Nuxt --> Vault
    Nuxt --> WS
    WS -->|"refresh"| UI2
  end

  subgraph OptionalPeers["Optional peers"]
    OtherDevice["Other device / daemon"]
    Agent["Agent\nwriters/agent/tokenId"]
  end

  Daemon -.->|"mesh stub → iroh later"| OtherDevice
  Nuxt -.->|"hub replica\nnot content master"| OtherDevice
  Agent --> Nuxt
  Agent -.-> Daemon
```

## Dual-mode: `git-live` vs `mesh-live`

```mermaid
flowchart LR
  Save["Save note"] --> Mode{syncMode?}
  Mode -->|git-live legacy| Git["writeToWorkspace\nfile + Git commit/push\n+ lock ADR-007"]
  Mode -->|mesh-live| Mesh["file only\n+ writers/ prefix\n+ WS invalidate\n+ explicit publish"]
  Git --> Disk["Vault disk"]
  Mesh --> Disk
  Mesh --> Export["Git = export/backup\nGitHub interop\nNOT live"]
```

| | **git-live** (default) | **mesh-live** (target) |
| -- | -- | -- |
| Live write | Server Git | Files + ownership |
| Conflicts | Lock | `writers/` layout |
| Multi-browser | Lock / 503 | WS invalidate |
| Opt-in | — | `PATCH /api/workspaces/sync-mode` or env `SYNC_MODE` |

## Path ownership + publish

```mermaid
flowchart TB
  Actor["Actor"] --> Kind{who?}
  Kind -->|hosted human| U["user:id"]
  Kind -->|solo device| D["device:solo"]
  Kind -->|agent| A["agent:tokenId"]
  U --> Draft["writers/user/id/…"]
  D --> Draft2["writers/device/solo/…"]
  A --> Draft3["writers/agent/…"]
  Draft --> Pub["POST /api/notes/publish"]
  Draft2 --> Pub
  Draft3 --> Pub
  Pub --> Canon["Canonical root\nFoam / graph"]
  SyncApply["mesh save / sync apply"] -.->|"forbidden"| Canon
```

Encoding: logical `kind:id` → on-disk `writers/<kind>/<id>/…` (`writer-prefix.ts`).

## Hosted runtime sequence

```mermaid
sequenceDiagram
  participant B1 as Browser A
  participant B2 as Browser B
  participant API as Nuxt API
  participant Disk as Vault disk
  participant WS as /ws/vault
  B1->>API: PUT /api/notes/foo
  Note over API: mesh-live → writers/user/A/foo
  API->>Disk: write file
  API->>WS: vault-invalidate
  WS-->>B2: refresh
  B1->>API: POST /api/notes/publish
  API->>Disk: move → canonical foo.md
  API->>WS: invalidate
```

Auth / GitHub App / content roots stay **orthogonal**: they gate *who may manage* a
workspace, not *who wins* on a path (ownership does).

## Portable today vs target

```mermaid
flowchart LR
  Browser["Local browser"] -->|"target"| Daemon["fluffmind-daemon"]
  Daemon -->|"PUT /v1/notes"| Files["VAULT_PATH"]
  Browser -.->|"still common"| NuxtSolo["Nuxt AUTH_DISABLED\n+ VAULT_PATH"]
  NuxtSolo --> Files
```

**Gap:** daemon HTTP exists (`scripts/fluffmind-daemon.mjs --self-check`); Nuxt UI is
**not** yet the thin client exclusively talking to the daemon.

## Decision stack

```mermaid
flowchart TB
  ADR016["ADR-016 transport"] --> PRD042["PRD-042"]
  ADR017["ADR-017 ownership"] --> PRD042
  ADR018["ADR-018 dual-mode"] --> PRD042
  ADR019["ADR-019 hosted browsers"] --> PRD042
  PRD042 --> PLAN042["PLAN-042 T1–T10"]
  PLAN042 --> Code["Shipped on main b3b23aa"]
  Code --> Gap["Product hardening left"]
```

## Shipped vs remaining (session handoff 2026-11-14)

### Done

- Explore map [#141](https://github.com/chatondearu/fluffmind/issues/141) → ADR-016…019
- PLAN-042 **T1–T10** (mode, mesh write, writers, publish, WS, hosted writer, daemon,
  in-memory mesh stub, sync-mode API/UI, docs)
- Commit `feat(sync): implement mesh-live dual-mode sync rethink (PRD-042)` on `main`

### Still to do (product feel / next sessions)

| Priority | Gap | Why |
| -------- | --- | --- |
| High | Wire Nuxt UI ↔ portable daemon | Close portable facade |
| High | Real mesh transport (iroh + relay) replacing in-memory stub | Multi-device peers |
| Medium | Folder mutations fully mesh-live (some paths still Git) | Consistency |
| Medium | Operator smoke: opt-in sync-mode + dogfood | Validate dual-mode |
| Low | Nuxt live path using `MeshSyncTransport` | Stub ready, not wired |
| Later | Same-note CRDT | Out of PRD-042 |
| Later | Supersede ADR-002 after real migrates | Per ADR-018 |

### Suggested next session (pick one)

1. **UI → daemon** portable round-trip (highest product clarity).
2. **iroh spike** behind `MeshSyncTransport` (replace in-memory hub).
3. **Folder mesh-live** + audit remaining Git-live call sites.

Breadcrumb: *je suis là — suite = brancher UI↔daemon OU iroh derrière MeshSyncTransport.*

## Code map (quick)

| Concern | Where |
| ------- | ----- |
| syncMode | `apps/web/server/vault/sync-mode.ts`, DB `workspace_config.sync_mode`, `SYNC_MODE` |
| mesh write / writers | `write.ts`, `writer-prefix.ts`, `hosted-writer.ts`, `mesh-write.ts` |
| publish | `publish.ts`, `POST /api/notes/publish` |
| WS invalidate | `vault-invalidate.ts`, `/ws/vault`, `useVaultInvalidate` |
| migrate API | `GET\|PATCH /api/workspaces/sync-mode`, `WorkspaceSyncModeSection` |
| daemon | `scripts/fluffmind-daemon.mjs`, `apps/web/server/daemon/` |
| mesh stub | `packages/integrations/src/mesh/` |
