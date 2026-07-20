# PLAN-032 — Portable solo package

- **Status**: draft
- **PRD**: [[../prd/PRD-032-portable-solo-package|PRD-032]]
- **Date**: 2026-07-20
- **Design**: `docs/superpowers/specs/2026-07-20-p8-portable-solo-package-design.md`

## Summary

Package Nitro output + embedded Node 22 into OS/arch archives with a launcher that
forces solo mode, resolves the vault path, checks for Git, and starts the server.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-003-simple-git-binary|ADR-003]] | Real `git` on PATH — do not replace with isomorphic-git |
| [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]] | No `DATABASE_URL` → file lock; set `WORKSPACES_ROOT` to package `data/` |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Vault stays plain markdown on disk |

## Scope

### In scope

- `scripts/package-portable.mjs`
- `bin` launcher templates (sh + cmd)
- `.github/workflows/release-portable.yml`
- README + foam/vision/PRD status updates when shipping

### Out of scope

- Single exe, folder-picker UI, bundled git, codesign

## Technical approach

1. Build `@fluffmind/web` via turbo (reuse Docker builder command).
2. Download pinned Node 22 distro for target platform into `runtime/node`.
3. Copy `.output` → `app/.output`.
4. Write launchers that set env and exec embedded node.
5. Archive + checksum.
6. CI matrix for four targets (or build on matching runners: macos-14, ubuntu, windows).

**Note:** Cross-compiling Node binaries is unnecessary — download official builds. The
Nitro `.output` is JS and is OS-agnostic enough to reuse one build for all targets
(verify native deps: none expected beyond `git` at runtime). If a native addon appears
later, matrix must build on each OS.

## Tasks

- [ ] **T1** — Launcher templates + local smoke on current OS — [#126](https://github.com/chatondearu/fluffmind/issues/126)
- [ ] **T2** — `scripts/package-portable.mjs` (download Node, assemble, pack) — [#127](https://github.com/chatondearu/fluffmind/issues/127)
- [ ] **T3** — GitHub Actions `release-portable.yml` — [#128](https://github.com/chatondearu/fluffmind/issues/128)
- [ ] **T4** — README + vision + foam index; mark PRD shipped when first release works — [#129](https://github.com/chatondearu/fluffmind/issues/129)
- [ ] **T5** — Manual QA checklist (mac/linux/win as available)

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Native module in `.output` | Audit build; fail CI if `.node` binaries present without per-OS build |
| Large artifacts (~50–80MB with Node) | Accept for v1; document size |
| Windows path / browser open | Use `start` in cmd; test on windows-latest runner |

## Test plan

- [ ] Package locally; run against temp vault; create note; confirm file on disk
- [ ] Unset PATH git → expect exit 1
- [ ] CI dry-run `workflow_dispatch`

## Verification

- [ ] Artifacts attach to a GitHub Release
- [ ] `./scripts/import-kanban.sh` after closing issues
