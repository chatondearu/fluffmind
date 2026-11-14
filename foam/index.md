# Project memory

Map of Content (MOC). Start here before product or architecture decisions.

## How to use

1. **New feature** → `prd/template.md` → `prd/PRD-NNN-slug.md`, link ADRs.
2. **Implementation** → `plans/template.md` → `plans/PLAN-NNN-slug.md`.
3. **Technical choice** → `foam/decisions/ADR-NNN-slug.md`.
4. **Sync kanban** → `./scripts/import-kanban.sh` refreshes [[features/shipped|shipped]] / [[features/backlog|backlog]].
5. **Board events** → `./scripts/gh-board.sh events` (see `.github/kanban.env`).

## Product

- [[product/vision|Vision & positioning]]
- [[architecture/roadmap|Roadmap P0–P7]]

## Features

- [[features/index|Feature catalog]]
- [[features/shipped|Shipped]] (auto-generated from GitHub)
- [[features/backlog|Backlog]] (auto-generated from GitHub)

## Architecture

- [[architecture/monorepo|Monorepo layout]]
- [[architecture/vault-engine|Vault engine & Git sync]]
- [[architecture/sync-architecture|Sync architecture — portable vs hosted]] — **resume map** (diagrams, liaisons, gaps)
- [[architecture/rethink-sync|Rethink: simplify sync (Rust + mesh)]] — PLAN-042 T1–T10 shipped; ADR-016…019; map [#141](https://github.com/chatondearu/fluffmind/issues/141)
- User-facing rationale: `DESIGN.md` (link, do not duplicate)

## Decisions (ADRs)

Index: [[decisions/index|All ADRs]]

## PRDs & plans

| PRD | Plan | Status |
| --- | ---- | ------ |
| [[../prd/PRD-023-p2-auth-workspaces|PRD-023 P2 auth]] | [[../plans/PLAN-023-p2-auth-workspaces|PLAN-023]] | shipped |
| [[../prd/PRD-024-p3-block-editor|PRD-024 P3 editor]] | _(plan TBD)_ | shipped |
| [[../prd/PRD-028-mvp-ship|PRD-028 MVP]] | _(inline in PRD)_ | shipped |
| [[../prd/PRD-029-vault-sidebar-navigation|PRD-029 sidebar]] | [[../plans/PLAN-029-vault-sidebar-navigation|PLAN-029]] | shipped |
| [[../prd/PRD-030-editor-vault-v2|PRD-030 editor v2]] | [[../plans/PLAN-030-editor-vault-v2|PLAN-030]] | shipped |
| [[../prd/PRD-031-p7-distributed-workspace-lock|PRD-031 P7a lock]] | [[../plans/PLAN-031-p7-distributed-workspace-lock|PLAN-031]] | shipped |
| [[../prd/PRD-032-portable-solo-package|PRD-032 portable solo]] | [[../plans/PLAN-032-portable-solo-package|PLAN-032]] | shipped |
| [[../prd/PRD-033-github-app-installations|PRD-033 GitHub App]] | [[../plans/PLAN-033-github-app-installations|PLAN-033]] | shipped |
| [[../prd/PRD-034-github-repo-on-workspace-create|PRD-034 create GitHub repo]] | [[../plans/PLAN-034-github-repo-on-workspace-create|PLAN-034]] | in progress |
| [[../prd/PRD-042-sync-rethink|PRD-042 sync rethink]] | [[../plans/PLAN-042-sync-rethink|PLAN-042]] | partial (T1–T10 code; product hardening left) |

**Next / resume:** [[architecture/sync-architecture|Sync architecture]] — H1–H3 hardening landed (UI↔daemon, TCP mesh, folder mesh-live); next = apply→`MeshSyncTransport` **or** operator smoke. PRD-034 still in progress; stretch [#28](https://github.com/chatondearu/fluffmind/issues/28). Map [#141](https://github.com/chatondearu/fluffmind/issues/141). Kanban → foam last synced 2026-07-23 (`./scripts/import-kanban.sh`).

- PRD template: `prd/template.md`
- Plan template: `plans/template.md`
- Superpowers archive: `docs/superpowers/README.md`

## External

- [GitHub Project #3 — Fluffmind](https://github.com/users/chatondearu/projects/3)
- [Milestones](https://github.com/chatondearu/fluffmind/milestones)

## Tags

`#product` `#architecture` `#deployment` `#data` `#auth`
