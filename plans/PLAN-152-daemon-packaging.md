# PLAN-152 — Package the Rust daemon (portable sidecar, Coolify service, relay)

- **Status**: in review
- **PRD**: [[../prd/PRD-042-sync-rethink|PRD-042]] (OQ4) · [[../prd/PRD-032-portable-solo-package|PRD-032]]
- **ADR**: [[../foam/decisions/ADR-020-rust-daemon-iroh-transport|ADR-020]] §9
- **GitHub**: [#152](https://github.com/chatondearu/fluffmind/issues/152) · map [#141](https://github.com/chatondearu/fluffmind/issues/141)
- **Depends on**: [#151](https://github.com/chatondearu/fluffmind/issues/151) ([[PLAN-151-iroh-transport-relay|PLAN-151]])
- **Date**: 2026-11-17

## Summary

Ship `fluffmind-daemon` where Fluffmind runs: a sidecar in every portable archive, a
`sync` service next to `web` in the compose / Coolify stack, and an optional self-hosted
`iroh-relay` service.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-020-rust-daemon-iroh-transport|ADR-020]] | Sidecar in portable; separate `sync` compose service (not inside `web`); token required off-loopback; relay at the pinned iroh version |
| [[../foam/decisions/ADR-018-sync-transition-dual-mode|ADR-018]] | Git-live workspaces keep working when the daemon is absent |
| PRD-032 | Portable targets darwin-arm64, darwin-x64, linux-x64, win-x64; no Docker/Postgres needed |

## Scope

### In scope

- Cross-compiled daemon per portable target; launcher lifecycle (start, health wait, stop)
- Dockerfile `daemon` target (static musl); `sync` + optional `relay` services in both compose files
- Env parity (`.env.example`, compose files) and README sections (Portable, Deploying)

### Out of scope

- Codesign / notarization (PRD-032 v1.1)
- Relay on infrastructure other than compose (NixOS module etc.)
- New sync behaviour

## Technical approach

Portable: `package-portable` downloads or builds the per-target daemon artifact produced by
the release workflow (cross builds via `cargo zigbuild` or per-OS runners — pick in T1) and
places it next to the embedded Node. Launchers start the daemon on loopback, wait for
`/health`, export `NUXT_PUBLIC_DAEMON_URL`, start Nuxt, and stop the daemon on exit.
Hosted: `web` reaches `sync` at `FLUFFMIND_DAEMON_URL=http://sync:8787` with
`FLUFFMIND_DAEMON_TOKEN` (server-side only; no `/__daemon` proxy when auth is on); `sync` mounts `workspaces-data`; only the relay is public.

## Tasks

- [ ] **T1 — Release builds.** Release workflow builds the daemon for the four portable
      targets and attaches SHA256s. Acceptance: workflow run produces four binaries.
- [ ] **T2 — Portable sidecar.** Archives include the binary; unix + Windows launchers
      start it, wait for health, pass `NUXT_PUBLIC_DAEMON_URL`, and stop it on exit;
      `--no-daemon` keeps Git-live solo behaviour. Acceptance: unzip + run on darwin-arm64,
      note save lands under `writers/device/…`, quitting leaves no daemon process.
- [ ] **T3 — Docker `daemon` target + `sync` service.** Static binary image; `sync` service
      in `docker-compose.yml` and `docker-compose.coolify.yml` with shared workspaces
      volume, internal network only, token from env. Acceptance: `docker compose up`, a
      mesh-live workspace save on `web` reaches `sync` (`/v1/mesh/changed` logged).
- [ ] **T4 — Optional `relay` service.** `iroh-relay` at the pinned version behind the
      Coolify proxy (TLS), `FLUFFMIND_RELAY_URL` documented; off by default. Acceptance:
      portable daemon on another network syncs through it (manual, deploy note).
- [ ] **T5 — Docs + parity.** `.env.example`, both compose files, README Portable and
      Deploying (Coolify) sections, AGENTS.md compose-parity list include the new env.
      Acceptance: review checklist; no env var present in one compose file only.

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Cross-compile pain (Windows, macOS from Linux) | Per-OS runners if zigbuild fails; one target per job |
| Orphan daemon after launcher crash | Launcher traps exit; daemon exits when parent pid dies (flag) |
| Archive size | Release profile `strip = true`, `lto = "thin"`; measure in T1 |
| Relay exposed without TLS | Only behind Coolify proxy; `--dev` relay for local tests only |

## Test plan

**Seams under test:**

1. **Launcher lifecycle** (start / health / stop) on each OS family
2. **Compose topology** (`web` ↔ `sync` over the internal network with token)

- [ ] Scripted smoke for seam 1 on the CI runner OS
- [ ] Manual compose smoke for seam 2; manual cross-network relay check

## Verification

- [ ] Release workflow green with four daemon artifacts
- [ ] `mise exec -- cargo build --release -p fluffmind-daemon`
- [ ] `mise exec -- pnpm lint && mise exec -- pnpm build`
- [ ] PRD-032 / PRD-042 updated (OQ4 shipped); foam sync-architecture updated
