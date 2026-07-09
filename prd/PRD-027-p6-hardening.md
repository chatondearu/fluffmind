# PRD-027 — Hardening (P6)

- **Status**: shipped
- **GitHub**: [#27](https://github.com/chatondearu/fluffmind/issues/27) (closed)
- **Merged**: PR [#85](https://github.com/chatondearu/fluffmind/pull/85) (2026-07-09)
- **Milestone**: P6 — Hardening

## Goal

Harden Fluffmind for real self-hosting: detect external Git changes (GitHub push
webhooks + manual pull), keep the vault index fresh in production, and surface sync
status in the UI.

## Exit criteria

- [x] GitHub `push` webhook triggers `git pull` + vault index refresh
- [x] Manual `POST /api/sync/pull` for operators (same code path as webhook)
- [x] Production vault file watcher (debounced index rebuild)
- [x] Sync status badge in the web UI (ahead/behind + pull action)
- [x] Notes list shows fetch errors with retry

## Out of scope (P6)

- Service worker / full offline editing
- Incremental index (still full rebuild; debounced only)
- Multi-workspace webhook routing (single `VAULT_PATH` / env workspace)
- Dedicated secrets management (see TODO in github-sync.ts)

## Architecture constraints

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | External changes via server-side git pull only |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Markdown on disk remains source of truth |

## Issue breakdown

| Issue | Scope |
| ----- | ----- |
| #80 | `pullFromRemote` in `@fluffmind/integrations` |
| #81 | GitHub push webhook (`POST /api/webhooks/github`) |
| #82 | Debounced vault watcher in production |
| #83 | Sync status UI + `POST /api/sync/pull` |
| #84 | Notes list error/loading polish |
