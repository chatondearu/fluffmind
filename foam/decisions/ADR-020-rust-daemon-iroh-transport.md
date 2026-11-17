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
   `GET /v1/notes` with the same writer-prefix rules ([[ADR-017-path-ownership-layout|ADR-017]]),
   response fields (including `contentHash`) and status codes. The mesh slice adds
   `POST /v1/mesh/changed { vault, path, writer, published, deleted }` (Nuxt tells the
   daemon a vault file changed: hosted writes, deletes/renames, and **publish** — the only
   caller that sets `published: true`), `PUT /v1/vaults/:id` (Nuxt pushes vault config, §7)
   and `GET /v1/events` (SSE: the daemon tells Nuxt a remote update landed → index
   invalidate + `/ws/vault`). On the Nuxt side this is one more `MeshSyncTransport`
   implementation (`DaemonMeshTransport`, whose update shape gains `writer`, `published`,
   `deleted`); `mesh-apply` keeps its role. Bind `127.0.0.1` by default; a bearer token
   (`FLUFFMIND_DAEMON_TOKEN`) is **required** when bound to a non-loopback address (hosted
   internal network). When a token is set, `/health` returns only `{ ok }` (no `vaultPath`).
   **Browser reach**: the `/__daemon` proxy exists only for portable/solo (daemon URL set
   **and** auth off) and never carries the token; hosted Nuxt calls the daemon server-side
   only.
3. **Disk ownership**: the daemon persists remote updates itself (sync must work with no UI
   open). Nuxt keeps writing its own mesh-live writes (hosted drafts, publish) and notifies
   the daemon; it does not re-write files the daemon already applied. Both sides write
   **atomically** (temp file in the same directory + rename): Nuxt's lock is per process and
   does not cover the daemon.
4. **Transport: iroh 1.x pinned to an exact version** (start from neomind's pin, bump
   monthly / on RUSTSEC). ALPNs `fluffmind/enrol/1` and `fluffmind/sync/1` — one versioned
   ALPN per protocol; a wire change bumps the suffix. mDNS on LAN. `iroh-docs` and
   `iroh-gossip` are not used (same reasons as neomind ADR-009 §6/§9).
5. **Sync protocol = notify, then pull** (neomind ADR-009 §9 pattern): per vault, each
   writer prefix has a manifest `path → (BLAKE3 | deleted, mtimeMs, published?)` signed by
   the origin peer key; deletions and renames are **LWW tombstones** (`deleted: true` +
   `mtimeMs`, a rename = tombstone on the old path + entry on the new one), so a delete wins
   over an older write and stale files do not linger on peers; a
   changed peer sends `Changed { vault, writer }` to online peers, which pull the manifest
   and the newer blobs; fallback pull on reconnect and on a slow interval. Granularity stays
   **whole-file LWW per path** ([[ADR-016-live-sync-transport|ADR-016]] §4). Any peer (the
   host included) forwards what it holds, so a star through the host and direct
   device↔device links both converge.
6. **Identity & trust (no master)**: ed25519 key per daemon install (= `EndpointId`, 0600
   in the daemon data dir). Each vault keeps an **allow-list of peer keys**, each bound to
   the writer identities it may author (`device:<id>`; the host key authors hosted
   `user:*` and `agent:*`) and a **`canPublish` grant** (may it author canonical root
   entries). The host key gets `canPublish` for its hosted workspaces; a device gets it only
   when the enrolling side grants it explicitly. Enrolment: a ticket (EndpointId + relay URL + vault id +
   one-time code; TTL, single-use, rate-limited — neomind PRD-88 controls). Unlike neomind
   there is **no master, roster epoch or handover**: the host is a hub replica, not a
   master ([[ADR-016-live-sync-transport|ADR-016]] §2).
7. **Apply rules** (enforce [[ADR-017-path-ownership-layout|ADR-017]] on the wire): a
   `writers/<kind>/<id>/` path is accepted only when the manifest's origin key is allowed
   for that writer; a canonical (root) path is accepted only from a manifest entry marked
   `published` **and** signed by a key holding `canPublish` — `published` is set only by
   the explicit publish action on the origin peer (Nuxt `publishNoteToCanonical` →
   `/v1/mesh/changed { published: true }`), never by an ordinary save, and a self-asserted
   flag from a key without the grant is refused. Sync apply never turns a writer-prefix
   update into a canonical write. [[ADR-012-workspace-content-roots|ADR-012]] content roots
   still filter what a vault exposes. **Vault config has one source of truth**: hosted, the
   Postgres workspace config (`syncMode`, `contentRoots`) stays the master copy and Nuxt
   pushes it to the daemon (`PUT /v1/vaults/:id`) on boot and on every change (ADR-018
   dual-mode toggle included); the daemon serves only `mesh-live` vaults it was told about.
   Portable (no DB), the daemon's own config file is the source.
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
    `cargo clippy -- -D warnings`, `cargo test`); `Cargo.lock` committed. Locally, run
    cargo through Mise (`mise exec -- cargo …`).
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
| Signatures | Per-writer manifests signed; no per-message signatures (each writer serves only its own files) | Same signed manifests, **required**: the host forwards other writers' manifests, so the origin key must stay checkable after a hop; plus `canPublish` for root entries |
| Mobile | UniFFI Kotlin host (neomind ADR-020) | Not planned; a UniFFI facade stays possible later |

## Implementation notes (PLAN-151, 2026-11-17)

Decisions taken while building §3–8; they refine, not contradict, the sections above.

- **Signatures are per entry, not per manifest.** Each `path → (hash | tombstone, mtimeMs,
  published, writer)` entry is signed by its origin key over `vault id + fields`, so a peer can
  forward entries from several origins and every receiver still verifies each one; the vault id
  in the signed bytes stops replay across vaults. The hub serves its whole entry list.
- **Two vault ids.** The local id (Nuxt workspace id, or `default` for `--vault`) never crosses
  the wire; peers know the vault by a random 32-byte *mesh id* created on first attach and carried
  in tickets. The first enrol adopts the ticket's mesh id (own entries are re-signed).
- **Grants.** The issuer decides what the enrollee may author (`--writer`, `--can-publish`) and
  asks for its own grant on the enrollee's side (`--self-can-publish`, default writers
  `<default writer>, user:*, agent:*`); the enrollee records it from the enrol reply.
  Writer grants are exact `kind:id` or `kind:*`.
- **Disk ownership.** The daemon applies remote entries (atomic write + mtime = entry mtime) and
  notifies Nuxt over SSE with `persisted: true`; Nuxt only invalidates. A local file that is
  newer than the remote entry and not yet announced is never overwritten.
- **Config.** `PUT /v1/vaults/:id` attaches (`mesh-live`) or detaches; detach is a no-op for an
  unknown vault, in-flight pulls stop applying, and a re-attach re-pulls. Attached vaults
  persist in `<data dir>/vaults/<id>.json` (with the allow-list and entry index) and re-attach at
  boot, so sync runs headless.
- **Transport options.** `FLUFFMIND_RELAY_URL` → custom relay (peers dial through it, ticket
  carries it); `FLUFFMIND_MESH_DIRECT=1` → no relay; neither → n0 presets (dev fallback).
  mDNS LAN discovery uses `iroh-mdns-address-lookup` (non-fatal; `FLUFFMIND_MESH_MDNS=0`).
  Relay TLS roots are configurable in `MeshOptions::relay_ca_tls` (private CA; tests use the
  in-process relay of `iroh::test_utils`).
- **Known limits / follow-ups.** (1) Allow-lists are per link: device↔device through the host
  needs the two devices enrolled to each other (a host-vouched grant gossip is a follow-up).
  (2) No peer revocation yet. (3) Only changes announced through the daemon HTTP API sync; files
  that pre-exist an attach are not scanned. (4) Pending enrol codes live in memory (a restart
  invalidates open tickets). (5) Whole index JSON rewrite per change (fine for note-sized
  vaults). (6) No Nuxt enrol UI (CLI + HTTP only). (7) Any allow-listed peer reads the whole vault index
  and blobs, drafts of other writers included (the allow-list scopes *authoring*, not reading).
  (8) Path checks are lexical: a symlinked directory inside a vault is followed. (9) Tombstones
  are never garbage-collected; the index file is rewritten per change. (10) The enrol limiter is
  keyed by `EndpointId`, which a stranger can mint: a flood can lock a live ticket out for the
  window (guessing the 60-bit code stays infeasible). (11) `/__daemon` (browser proxy) only
  forwards `/health` and `/v1/notes`; every mesh route is server-side.

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
