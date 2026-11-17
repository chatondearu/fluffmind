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
- Signed per-writer manifests (`path → BLAKE3, mtimeMs, published?`), `Changed` notify, pull, fallback pull
- Daemon HTTP: `POST /v1/mesh/changed`, `GET /v1/events` (SSE), enrol ticket issue/redeem routes (token-gated)
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
      enrollee's writer identities. CLI `ticket` / `enrol` + token-gated HTTP routes.
      Acceptance: tests for redeem, replay refused, expired refused, stranger refused.
- [ ] **T3 — Apply rules on the wire.** Manifest signed by origin key; receiver rejects a
      `writers/<kind>/<id>/` entry whose origin is not allowed for that writer, a root
      entry not marked `published`, and paths outside content roots; forwarding through a
      third peer keeps the origin check valid. Acceptance: tests per rejection + forward
      through hub.
- [ ] **T4 — Catch-up + LWW.** Fallback pull on reconnect and on an interval; LWW by
      `mtimeMs`, tie broken by BLAKE3 for determinism; offline peer converges after
      reconnect. Acceptance: test with B offline during A's write.
- [ ] **T5 — Relay.** `FLUFFMIND_RELAY_URL` (n0 public as dev fallback); peers dial each
      other through a local `iroh-relay --dev` at the pinned version. Acceptance: test or
      scripted smoke with direct addresses disabled.
- [ ] **T6 — Daemon ↔ Nuxt events.** `POST /v1/mesh/changed { vault, path }` (re-hash +
      notify) and `GET /v1/events` SSE `{ vault, path, mtimeMs, persisted: true }`.
      Acceptance: HTTP tests.
- [ ] **T7 — `DaemonMeshTransport` (TS).** Implements `MeshSyncTransport` over the two
      routes; Nuxt mesh plugin binds it per mesh-live workspace when
      `FLUFFMIND_DAEMON_URL` is set; `mesh-apply` invalidates without re-writing when the
      update is `persisted`. Acceptance: vitest with a stub HTTP server; hosted dogfood:
      write on device daemon → browser on host refreshes.
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
| Daemon and Nuxt both writing one vault dir | Disk ownership rule ADR-020 §3; `persisted` flag skips Nuxt re-write |
| Relay unreachable | Direct + mDNS still work on LAN; `/health` reports relay state |

## Test plan

**Seams under test:**

1. **Mesh peer** (two or three in-process daemons): sync, catch-up, LWW
2. **Enrol protocol**: ticket redeem / refusal
3. **Apply policy**: writer and publish checks, content roots
4. **Daemon HTTP events**: `/v1/mesh/changed`, `/v1/events`
5. **`MeshSyncTransport` adapter** on the Nuxt side

- [ ] `cargo test` covers seams 1–4
- [ ] vitest covers seam 5 (stub daemon)
- [ ] Manual: two machines on different networks through a self-hosted relay

## Verification

- [ ] `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
- [ ] `mise exec -- pnpm lint && mise exec -- pnpm typecheck && mise exec -- pnpm test`
- [ ] Foam: ADR-016 TCP addendum marked removed; sync-architecture "Still to do" updated
