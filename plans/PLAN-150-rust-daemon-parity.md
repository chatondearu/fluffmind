# PLAN-150 — Rust daemon with HTTP parity

- **Status**: draft
- **PRD**: [[../prd/PRD-042-sync-rethink|PRD-042]] (approved; OQ2 resolved by ADR-020)
- **ADR**: [[../foam/decisions/ADR-020-rust-daemon-iroh-transport|ADR-020]]
- **GitHub**: [#150](https://github.com/chatondearu/fluffmind/issues/150) · map [#141](https://github.com/chatondearu/fluffmind/issues/141)
- **Date**: 2026-11-17
- **Next**: [[PLAN-151-iroh-transport-relay|PLAN-151]] → [[PLAN-152-daemon-packaging|PLAN-152]]

## Summary

Swap the portable daemon runtime from Node to Rust under an **unchanged HTTP contract**
(ADR-020 §1–2, §10–11a). No mesh in this slice. The Nuxt UI keeps talking to
`NUXT_PUBLIC_DAEMON_URL` / `/__daemon` and must not notice the swap.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-020-rust-daemon-iroh-transport|ADR-020]] | Rust binary; same HTTP API; loopback default, token required off-loopback; Cargo outside Turborepo; Rust pinned in Mise + flake |
| [[../foam/decisions/ADR-017-path-ownership-layout|ADR-017]] | Writes only under `writers/<kind>/<id>/`; sanitized ids `[A-Za-z0-9._-]+` |
| [[../foam/decisions/ADR-018-sync-transition-dual-mode|ADR-018]] | Daemon never commits/pushes Git (`committed: false`, `pushed: false`) |
| [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]] | Note ids resolve inside the vault root (no `..` escape) |

## Scope

### In scope

- Cargo workspace + `fluffmind-daemon` crate, toolchain pins, CI job
- HTTP parity: `GET /health`, `PUT /v1/notes`, `GET /v1/notes`; same CLI flags and `SYNC_WRITER_DEVICE` env
- Optional bearer token (`FLUFFMIND_DAEMON_TOKEN`), mandatory when bind is non-loopback
- Shared writer-prefix case table consumed by TS and Rust tests
- Delete the Node daemon once the contract smoke passes against the binary

### Out of scope

- iroh, relay, `/v1/mesh/*`, `/v1/events` (PLAN-151)
- Portable archive / Docker image (PLAN-152)
- Any change to `apps/web` UI code

## Technical approach

Cargo workspace at the repo root (`members = ["crates/*"]`), crate `fluffmind-daemon`
(tokio, axum, serde, clap). Port `write-local.mjs` semantics 1:1: `parseWriterIdentity`,
`noteIdForMeshWriter`, `resolveNoteFilePath`, `WriterPrefixViolationError` → 400. The
contract smoke is today's `--self-check` assertions turned into a script that targets any
base URL, so the same checks gate the Node → Rust swap.

## Tasks

- [ ] **T1 — Toolchain + empty binary.** Root Cargo workspace, crate builds a `--help`
      binary; Rust pinned in `mise.toml` and flake devShell; `Cargo.lock` committed;
      `target/` ignored. Acceptance: `cargo run -p fluffmind-daemon -- --help` prints usage.
- [ ] **T2 — Writer identity + path resolution.** Rust equivalents of
      `parseWriterIdentity` / `noteIdForMeshWriter` / `resolveNoteFilePath` driven by a
      shared JSON case table (inputs → expected id or error kind) that the existing TS
      tests also read. Acceptance: both `cargo test` and the TS daemon/writer tests pass on
      the same table.
- [ ] **T3 — HTTP parity.** `GET /health` (`ok`, `vaultPath`, `defaultWriter`,
      `syncMode: "mesh-live"`), `PUT /v1/notes` (201 created / 200 updated, body
      `{ id, path, created, committed:false, pushed:false }`), `GET /v1/notes?id&writer`
      (200 / 404 / 400), JSON `{ error }` on failure. Acceptance: contract smoke green.
- [ ] **T4 — CLI parity + self-check.** Flags `--vault --port --host --writer
      --self-check --help`; `--self-check` runs the contract against a temp vault and
      prints `self-check: ok`. Acceptance: `fluffmind-daemon --self-check` exits 0.
- [ ] **T5 — Token gate.** `FLUFFMIND_DAEMON_TOKEN` checked as `Authorization: Bearer`
      on every route except `/health`; startup refuses a non-loopback `--host` without a
      token. Nuxt `/__daemon` proxy forwards the header when the env is set. Acceptance:
      unit tests for 401 and for the startup refusal.
- [ ] **T6 — CI.** Rust job: `cargo fmt --check`, `cargo clippy --all-targets -- -D
      warnings`, `cargo test`, `fluffmind-daemon --self-check`. Acceptance: job green on PR.
- [ ] **T7 — Retire Node daemon.** Docs/scripts point at the Rust binary; delete
      `scripts/fluffmind-daemon.mjs` and `apps/web/server/daemon/` (the TCP publish
      helper goes with PLAN-151 if still referenced). Acceptance: `rg fluffmind-daemon.mjs`
      returns only history docs; `pnpm lint typecheck test` green.

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Subtle behaviour drift TS ↔ Rust (ids, `.md`, errors) | Shared case table + contract smoke run against both before deletion |
| Rust toolchain breaks NixOS / Mise users | Pin in both `mise.toml` and flake; follow `nix-develop-shell` fallback |
| UI regression | No UI change in scope; dogfood autosave through `/__daemon` before T7 |

## Test plan

**Seams under test:**

1. **Writer identity / path resolution** (pure functions, shared case table)
2. **Daemon HTTP contract** (black-box over a temp vault)
3. **Token gate** (HTTP + startup)

- [ ] `cargo test` covers seams 1–3
- [ ] Contract smoke against the Rust binary (and once against the Node daemon before T7)
- [ ] Manual: portable dev UI autosave via `/__daemon` writes under `writers/device/solo/`

## Verification

- [ ] `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
- [ ] `cargo run -p fluffmind-daemon -- --self-check`
- [ ] `mise exec -- pnpm lint && mise exec -- pnpm typecheck && mise exec -- pnpm test`
- [ ] Foam: ADR-020 unchanged or amended; sync-architecture code map updated
