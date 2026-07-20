# PRD-032 — Portable solo package

- **Status**: approved
- **Date**: 2026-07-20
- **Tags**: #product #deployment
- **GitHub**: Epic [#125](https://github.com/chatondearu/fluffmind/issues/125) · Milestone [P8 — Portable solo](https://github.com/chatondearu/fluffmind/milestone/10)
- **Design**: `docs/superpowers/specs/2026-07-20-p8-portable-solo-package-design.md`
- **Plan**: [[../plans/PLAN-032-portable-solo-package|PLAN-032]]
- **Depends on**: Solo mode (AUTH_DISABLED), ADR-003 (git), ADR-007 (file lock without DB)

## Problem

Users want Fluffmind locally **without Docker, Postgres, or a full Node/pnpm toolchain**.
Solo mode already exists in the app; distribution does not.

## Goals

- [ ] Portable archive per OS/arch with embedded Node 22 + Nitro `.output` + launcher
- [ ] Vault via `--vault` / `VAULT_PATH` / package `./vault`
- [ ] Require Git on PATH with clear error
- [ ] Force solo env (no auth DB)
- [ ] Default bind `127.0.0.1:3000`, optional `--port` / `--no-open`
- [ ] CI release artifacts + SHA256
- [ ] README + foam updates

## Non-goals

- Single-file executable
- In-app vault folder picker (follow-up P8b)
- Bundled Git
- Auth/Postgres in the package
- Codesign/notarization (v1.1)

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Solo PKM user | Downloads zip for their OS, runs launcher, edits vault in browser |
| Foam/Obsidian user | Points `--vault` at existing markdown folder |
| Dev | Builds package locally via `scripts/package-portable.mjs` |

## Requirements

### Functional

- [ ] `scripts/package-portable.mjs` builds one or all targets
- [ ] Launchers for unix + windows
- [ ] Git preflight check
- [ ] Solo env forced by launcher
- [ ] GitHub Actions workflow for releases

### Non-functional

- [ ] Node major aligned with Dockerfile (22)
- [ ] Artifacts documented in README
- [ ] No Postgres required at runtime

## Related project memory

- [[../foam/product/vision|Vision]] — portable server package in scope; native GUI still out
- [[../foam/decisions/ADR-003-simple-git-binary|ADR-003]]
- [[../foam/decisions/ADR-007-distributed-workspace-lock|ADR-007]]
- Design: `docs/superpowers/specs/2026-07-20-p8-portable-solo-package-design.md`

## Open questions

_(None — resolved 2026-07-20.)_

## Success metrics

- Unzip + run on a Git-only machine works end-to-end
- Missing Git fails immediately with actionable message

## Issue breakdown (GitHub)

| Issue | Scope |
| ----- | ----- |
| [#125](https://github.com/chatondearu/fluffmind/issues/125) | Epic P8a |
| [#126](https://github.com/chatondearu/fluffmind/issues/126) | Launcher scripts |
| [#127](https://github.com/chatondearu/fluffmind/issues/127) | `package-portable.mjs` |
| [#128](https://github.com/chatondearu/fluffmind/issues/128) | CI release workflow |
| [#129](https://github.com/chatondearu/fluffmind/issues/129) | Docs |

## Implementation pointer

[[../plans/PLAN-032-portable-solo-package|PLAN-032]]
