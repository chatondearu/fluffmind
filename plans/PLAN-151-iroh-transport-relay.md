# PLAN-151 — iroh transport + relay behind MeshSyncTransport

- **Status**: draft
- **PRD**: [[../prd/PRD-042-sync-rethink|PRD-042]] (approved; OQ2 resolved by ADR-020)
- **ADR**: [[../foam/decisions/ADR-020-rust-daemon-iroh-transport|ADR-020]]
- **GitHub**: [#151](https://github.com/chatondearu/fluffmind/issues/151) · map [#141](https://github.com/chatondearu/fluffmind/issues/141)
- **Depends on**: [#150](https://github.com/chatondearu/fluffmind/issues/150) ([[PLAN-150-rust-daemon-parity|PLAN-150]])
- **Date**: 2026-11-17

## Summary

Make the Rust daemon a real mesh peer: iroh 1.x + relay, enrolment, notify-then-pull sync
of whole files with writer/publish checks (ADR-020 §3–8). Nuxt plugs into it through a
`DaemonMeshTransport` that implements the existing TS `MeshSyncTransport`; the localhost
TCP hub is deleted.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-020-rust-daemon-iroh-transport|ADR-020]] | iroh exact pin; ALPNs `fluffmind/enrol/1`, `fluffmind/sync/1`; allow-list per vault; no master; Nuxt never links iroh; token off-loopback |
| [[../foam/decisions/ADR-016-live-sync-transport|ADR-016]] | Whole-file LWW per path; host = hub replica; relay for NAT |
| [[../foam/decisions/ADR-017-path-ownership-layout|ADR-017]] | `writers/` paths only from the allowed origin key; canonical only via explicit publish |
| [[../foam/decisions/ADR-018-sync-transition-dual-mode|ADR-018]] | `mesh-live` vaults only; Git stays export/backup |
| [[../foam/decisions/ADR-019-hosted-multi-browser-coherence|ADR-019]] | Remote apply → index invalidate + `/ws/vault` |
| [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]] | Apply refuses paths outside content roots |

## Scope

### In scope

- Daemon: key file, multi-vault config, iroh endpoint (relay / direct / mDNS), enrol + sync ALPNs
- Signed per-writer manifests (`path → BLAKE3 | deleted, mtimeMs, published?`) with LWW tombstones, `Changed` notify, pull, fallback pull
- Allow-list entries `{ key, writers[], canPublish }`
- Daemon HTTP: `POST /v1/mesh/changed { vault, path, writer, published, deleted }`, `PUT /v1/vaults/:id` (config push), `GET /v1/events` (SSE), enrol ticket issue/redeem routes (token-gated)
- Nuxt: publish, delete and rename paths notify the daemon; vault config pushed on boot and on change
- TS `DaemonMeshTransport` + Nuxt plugin wiring; delete TCP hub + `MESH_TCP_*`
- Env: `FLUFFMIND_DAEMON_URL`, `FLUFFMIND_DAEMON_TOKEN`, `FLUFFMIND_RELAY_URL`, `FLUFFMIND_MESH_DIRECT`

### Out of scope

- Packaging, compose services, relay deployment (PLAN-152)
- Enrol UI in Nuxt (CLI + HTTP only; UI is a follow-up issue if wanted)
- Same-note CRDT, iroh-docs/gossip/blobs

## Technical approach

Reuse neomind's shapes (ADR-009 §1, §2, §6, §9; `doc/mesh.md` ALPN table and enrol
controls), not its code: no roster signature/epoch/handover. Vault id = random 32 bytes
created on first attach, carried in tickets. The Nuxt host binds one
`DaemonMeshTransport` per mesh-live workspace (vault id ↔ workspace id mapping held by the
daemon config). Remote updates are persisted by the daemon; the SSE event lets
`mesh-apply` skip the disk write and only invalidate.

## Tasks

- [ ] **T1 — Two daemons, one file, direct.** Key generation (0600), vault config, iroh
      endpoint with `FLUFFMIND_MESH_DIRECT=1`; hard-coded allow-list in a test; a write on
      A lands on B via `Changed` → manifest pull → blob fetch. Acceptance: Rust
      integration test with two in-process endpoints.
- [ ] **T2 — Enrolment.** `fluffmind/enrol/1`: ticket = EndpointId + relay + vault id +
      one-time code; TTL, single-use, per-source rate limit, opaque refusal, secrets
      redacted from logs; both sides add each other to the vault allow-list with the
      enrollee's writer identities and an explicit `canPublish` grant (default false for
      devices). CLI `ticket` / `enrol` + token-gated HTTP routes.
      Acceptance: tests for redeem, replay refused, expired refused, stranger refused.
- [ ] **T3 — Apply rules on the wire.** Manifest signed by origin key; receiver rejects a
      `writers/<kind>/<id>/` entry whose origin is not allowed for that writer, a root
      entry not marked `published`, a `published` root entry from a key without
      `canPublish` (self-asserted flag), and paths outside content roots; forwarding through
      a third peer keeps the origin check valid. Acceptance: tests per rejection + forward
      through hub.
- [ ] **T4 — Catch-up + LWW + tombstones.** Fallback pull on reconnect and on an
      interval; LWW by `mtimeMs`, tie broken by BLAKE3 for determinism. Deletes and renames
      are tombstones (`deleted`, `mtimeMs`; rename = tombstone + new entry): a newer
      tombstone removes the file on peers, an older one loses to a newer write. Offline
      peer converges after reconnect. Acceptance: tests with B offline during A's write,
      delete, and draft rename on publish.
- [ ] **T5 — Relay.** `FLUFFMIND_RELAY_URL` (n0 public as dev fallback); peers dial each
      other through a local `iroh-relay --dev` at the pinned version. Acceptance: test or
      scripted smoke with direct addresses disabled.
- [ ] **T6 — Daemon ↔ Nuxt events + config.** `POST /v1/mesh/changed { vault, path,
      writer, published, deleted }` (re-hash or tombstone, then notify); `PUT
      /v1/vaults/:id { syncMode, contentRoots, path }` replaces the daemon's view of a
      vault (a non-`mesh-live` vault is detached); `GET /v1/events` SSE `{ vault, path,
      mtimeMs, deleted, persisted: true }`. Acceptance: HTTP tests, including a vault
      flipped back to `git-live` stops syncing.
- [ ] **T7 — `DaemonMeshTransport` (TS) + Nuxt wiring.** Implements `MeshSyncTransport`
      (update shape gains `writer`, `published`, `deleted`); Nuxt binds it per mesh-live
      workspace when `FLUFFMIND_DAEMON_URL` is set. Publish to canonical sends
      `published: true` (the only caller that does); folder delete/rename and the draft
      rename on publish send `deleted` for the old path. Nuxt pushes workspace config to
      the daemon on boot and on every `syncMode` / `contentRoots` change (Postgres stays
      the source of truth). `mesh-apply` invalidates without re-writing when the update is
      `persisted`. Nuxt writes atomically (temp + rename). Acceptance: vitest with a stub
      HTTP server; hosted dogfood: write on device daemon → browser on host refreshes;
      publish on host → canonical file appears on the device.
- [ ] **T8 — Delete TCP hub.** Remove `startTcpMeshHub`, `connectTcpMeshPeer`, daemon
      TCP publish, `MESH_TCP_*` from code, env examples and compose files; keep
      `InMemoryMeshHub`. Acceptance: `rg MESH_TCP` empty outside history docs;
      `pnpm lint typecheck test` green.

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| iroh minor churn / RUSTSEC | Exact pin; monthly bump note in ADR-020; same version as relay |
| Echo loops through the hub | Pull only when manifest hash differs; never re-notify an unchanged manifest |
| Forged writer content via a forwarding peer | Origin-key signature on manifests (T3) |
| Daemon and Nuxt both writing one vault dir | Disk ownership rule ADR-020 §3; atomic temp + rename on both sides; `persisted` flag skips Nuxt re-write |
| Config drift Postgres ↔ daemon | Nuxt pushes config on boot and on change; daemon detaches vaults it was not told about |
| Stale files after delete/rename | LWW tombstones (T4) |
| Relay unreachable | Direct + mDNS still work on LAN; `/health` reports relay state |

## Test plan

**Seams under test:**

1. **Mesh peer** (two or three in-process daemons): sync, catch-up, LWW
2. **Enrol protocol**: ticket redeem / refusal
3. **Apply policy**: writer, `canPublish` and publish checks, tombstones, content roots
4. **Daemon HTTP events**: `/v1/mesh/changed`, `/v1/events`
5. **`MeshSyncTransport` adapter** on the Nuxt side

- [ ] `cargo test` covers seams 1–4
- [ ] vitest covers seam 5 (stub daemon)
- [ ] Manual: two machines on different networks through a self-hosted relay

## Verification

- [ ] `mise exec -- cargo fmt --check && mise exec -- cargo clippy --all-targets -- -D warnings && mise exec -- cargo test`
- [ ] `mise exec -- pnpm lint && mise exec -- pnpm typecheck && mise exec -- pnpm test`
- [ ] Foam: ADR-016 TCP addendum marked removed; sync-architecture "Still to do" updated
