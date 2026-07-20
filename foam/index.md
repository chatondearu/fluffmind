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
| [[../prd/PRD-031-p7-distributed-workspace-lock|PRD-031 P7a lock]] | [[../plans/PLAN-031-p7-distributed-workspace-lock|PLAN-031]] | approved |

**Next:** implement [[../prd/PRD-031-p7-distributed-workspace-lock|PRD-031]] (distributed lock). Static publishing remains a later slice of epic [#28](https://github.com/chatondearu/fluffmind/issues/28).

- PRD template: `prd/template.md`
- Plan template: `plans/template.md`
- Superpowers archive: `docs/superpowers/README.md`

## External

- [GitHub Project #3 — Fluffmind](https://github.com/users/chatondearu/projects/3)
- [Milestones](https://github.com/chatondearu/fluffmind/milestones)

## Tags

`#product` `#architecture` `#deployment` `#data` `#auth`
