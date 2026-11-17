# ADR-020 — Rust sync daemon + iroh transport

- **Status**: accepted (owner decision 2026-11-17: daemon in Rust; iroh = working choice)
- **Date**: 2026-11-17
- **Tags**: #architecture #sync #deployment
- **Amends**: [[ADR-016-live-sync-transport|ADR-016]] §1 (concrete library + runtime, explore 6C)

## Context

[[ADR-016-live-sync-transport|ADR-016]] chose an iroh-shaped mesh + relay but deferred the
library and the runtime (explore 6C, PRD-042 open question 2). PLAN-042 shipped a **Node**
portable daemon (`scripts/fluffmind-daemon.mjs`, `apps/web/server/daemon/`: `GET /health`,
`PUT|GET /v1/notes`, no Git) and, in hardening H2, a localhost **TCP hub** behind the TS
`MeshSyncTransport` contract because pulling `@number0/iroh` into pnpm needed native build
scripts (`allowBuilds`). The TCP hub only pushes live updates: a peer offline at publish
time misses them, it has no identity, and it cannot cross NAT.

The sibling project **neomind** already runs iroh in a single Rust binary
(neomind ADR-009, ADR-020; `doc/mesh.md`): iroh 1.x pinned to an exact version
(`=1.4.1` on 2026-11-17), self-hosted `iroh-relay` with n0 public relays as dev fallback
only, ed25519 key per node = `EndpointId`, one versioned ALPN per protocol, enrolment by
one-time code, and sync as *notify, then pull* over per-writer manifests
(`path → BLAKE3`). Owner decision 2026-11-17: the fluffmind daemon is written in **Rust**
and uses **iroh**.

## Decision

1. **Runtime: one Rust binary `fluffmind-daemon`** (crate `crates/fluffmind-daemon`, tokio +
   axum + iroh). It replaces the Node daemon and the Node TCP hub as the live sync peer.
   The Nuxt app stays Node and never links iroh.
2. **Nuxt ↔ daemon = HTTP**, same API as today's daemon so the UI (`NUXT_PUBLIC_DAEMON_URL`,
   `/__daemon` proxy, `useDaemonNotes`) is unchanged: `GET /health`, `PUT /v1/notes`,
   `GET /v1/notes` with the same writer-prefix rules ([[ADR-017-path-ownership-layout|ADR-017]])
   and status codes. The mesh slice adds `POST /v1/mesh/changed` (Nuxt tells the daemon a
   vault file changed: hosted writes, publish) and `GET /v1/events` (SSE: the daemon tells
   Nuxt a remote update landed → index invalidate + `/ws/vault`). On the Nuxt side this is
   one more `MeshSyncTransport` implementation (`DaemonMeshTransport`); `mesh-apply` keeps
   its role. Bind `127.0.0.1` by default; a bearer token (`FLUFFMIND_DAEMON_TOKEN`) is
   **required** when bound to a non-loopback address (hosted internal network).
3. **Disk ownership**: the daemon persists remote updates itself (sync must work with no UI
   open). Nuxt keeps writing its own mesh-live writes (hosted drafts, publish) and notifies
   the daemon; it does not re-write files the daemon already applied.
4. **Transport: iroh 1.x pinned to an exact version** (start from neomind's pin, bump
   monthly / on RUSTSEC). ALPNs `fluffmind/enrol/1` and `fluffmind/sync/1` — one versioned
   ALPN per protocol; a wire change bumps the suffix. mDNS on LAN. `iroh-docs` and
   `iroh-gossip` are not used (same reasons as neomind ADR-009 §6/§9).
5. **Sync protocol = notify, then pull** (neomind ADR-009 §9 pattern): per vault, each
   writer prefix has a manifest `path → (BLAKE3, mtimeMs)` signed by the origin peer key; a
   changed peer sends `Changed { vault, writer }` to online peers, which pull the manifest
   and the newer blobs; fallback pull on reconnect and on a slow interval. Granularity stays
   **whole-file LWW per path** ([[ADR-016-live-sync-transport|ADR-016]] §4). Any peer (the
   host included) forwards what it holds, so a star through the host and direct
   device↔device links both converge.
6. **Identity & trust (no master)**: ed25519 key per daemon install (= `EndpointId`, 0600
   in the daemon data dir). Each vault keeps an **allow-list of peer keys**, each bound to
   the writer identities it may author (`device:<id>`; the host key authors hosted
   `user:*` and `agent:*`). Enrolment: a ticket (EndpointId + relay URL + vault id +
   one-time code; TTL, single-use, rate-limited — neomind PRD-88 controls). Unlike neomind
   there is **no master, roster epoch or handover**: the host is a hub replica, not a
   master ([[ADR-016-live-sync-transport|ADR-016]] §2).
7. **Apply rules** (enforce [[ADR-017-path-ownership-layout|ADR-017]] on the wire): a
   `writers/<kind>/<id>/` path is accepted only when the manifest's origin key is allowed
   for that writer; a canonical (root) path is accepted only from a manifest entry marked
   `published` — produced by an explicit publish on the origin peer. Sync apply never turns
   a writer-prefix update into a canonical write. [[ADR-012-workspace-content-roots|ADR-012]]
   content roots still filter what a vault exposes.
8. **Relay**: self-hosted `iroh-relay` at the same pinned version, configured by
   `FLUFFMIND_RELAY_URL`; n0 public relays are a **dev fallback** only;
   `FLUFFMIND_MESH_DIRECT=1` disables relays for LAN / tests. One relay deployment may be
   shared with neomind when versions match, but neither project depends on the other.
9. **Packaging**:
   - **Portable** ([[../../prd/PRD-032-portable-solo-package|PRD-032]]): the daemon ships
     as a **sidecar binary** in each portable archive (same targets: darwin-arm64,
     darwin-x64, linux-x64, win-x64); the launcher starts it, then Nuxt with
     `NUXT_PUBLIC_DAEMON_URL`. Resolves PRD-042 open question 4.
   - **Hosted / Coolify**: a separate `sync` service built from a `daemon` target of the
     same Dockerfile (static musl binary), sharing the `/data/workspaces` volume and the
     internal network with `web`; optional `relay` service. Not a second process inside
     the `web` container.
10. **Build tooling**: Cargo workspace at the repo root (`Cargo.toml`, `crates/*`), outside
    pnpm workspaces and Turborepo (cargo has its own cache). Rust pinned in `mise.toml`
    and the flake devShell. CI gets a Rust job (`cargo fmt --check`,
    `cargo clippy -- -D warnings`, `cargo test`); `Cargo.lock` committed.
11. **Migration from the TS daemon**: (a) Rust daemon reaches HTTP parity, proven by a
    contract smoke (the assertions of today's `--self-check`) run against the binary, then
    the Node daemon files are deleted; (b) iroh lands behind `DaemonMeshTransport`, then
    `startTcpMeshHub` / `connectTcpMeshPeer` and `MESH_TCP_*` are deleted
    (`InMemoryMeshHub` stays for unit tests); (c) packaging. Writer-prefix rules now live
    in TS (Nuxt) and Rust (daemon): both test suites read one shared JSON case table.

### What differs from neomind

| Topic | neomind | fluffmind |
| ----- | ------- | --------- |
| Authority | Master-signed roster, epoch, handover | Per-vault allow-list; host = hub replica, no master |
| Write layout | One writer dir per agent | `writers/<kind>/<id>/` drafts + canonical root via explicit publish |
| Vaults | One memory per agent | Several vaults (projects / workspaces) per daemon |
| Local client | CLI over a unix socket | Nuxt web app over localhost HTTP (+ SSE) |
| Hosted | VPS agent = master | Coolify `web` + `sync` services; browsers never run a daemon |
| Mobile | UniFFI Kotlin host (neomind ADR-020) | Not planned; a UniFFI facade stays possible later |

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Node daemon + `@number0/iroh` bindings | Owner chose Rust; JS bindings trail iroh core; native `allowBuilds` in pnpm; two runtimes for one protocol anyway |
| Rust as a napi-rs addon inside Nuxt | Sync stops when the UI process stops (portable must sync headless); couples Coolify scaling of `web` to the mesh peer |
| Keep the TCP hub and add a relay later | No identity, no offline catch-up, no NAT traversal — rebuilding iroh badly |
| Neomind-style master roster | Contradicts ADR-016 §2 (host is not master); handover not needed for vault files |
| `iroh-docs` for replication | No 1.0 track, low activity, needs blobs + gossip; path-owned writers do not need it |
| Daemon as a second process in the `web` container | Needs a process supervisor; couples restarts; a compose service is simpler on Coolify |
| Wrap cargo in Turborepo tasks | No cache benefit; adds a fake package.json |

## Consequences

- **Positive**: a real peer with identity, NAT traversal, offline catch-up and encryption;
  headless portable sync; one protocol for portable and hosted; reuse of neomind's proven
  iroh patterns and relay ops.
- **Negative**: second toolchain (Rust) in the monorepo and CI; ≈ +4–8 MB per portable
  archive; writer-prefix rules duplicated in TS and Rust (mitigated by the shared case
  table); iroh minors to track monthly; relay to host for off-LAN use.
- **Constraint**: Nuxt never speaks iroh — it talks HTTP to the daemon. No Git in the live
  path ([[ADR-018-sync-transition-dual-mode|ADR-018]]): the daemon serves `mesh-live` vaults
  only. Any new daemon HTTP route keeps the token rule of §2.

## References

- PRD: [[../../prd/PRD-042-sync-rethink|PRD-042]] (OQ2, OQ4) · Explore map
  [#141](https://github.com/chatondearu/fluffmind/issues/141)
- Slices: [#150](https://github.com/chatondearu/fluffmind/issues/150) Rust daemon parity
  ([[../../plans/PLAN-150-rust-daemon-parity|PLAN-150]]) →
  [#151](https://github.com/chatondearu/fluffmind/issues/151) iroh + relay
  ([[../../plans/PLAN-151-iroh-transport-relay|PLAN-151]]) →
  [#152](https://github.com/chatondearu/fluffmind/issues/152) packaging
  ([[../../plans/PLAN-152-daemon-packaging|PLAN-152]])
- neomind (read-only prior art): `foam/decisions/ADR-009-mesh-iroh-roster.md`,
  `foam/decisions/ADR-020-android-host-uniffi.md`, `doc/mesh.md` (relay, ALPNs, enrol)
- Today's code: `scripts/fluffmind-daemon.mjs`, `apps/web/server/daemon/`,
  `packages/integrations/src/mesh/`, `apps/web/server/vault/mesh-apply.ts`
- [[../architecture/sync-architecture|Sync architecture]]
