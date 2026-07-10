# PRD-028 — MVP ship (post-P6)

- **Status**: approved
- **GitHub**: milestone **MVP — Ship**
- **Supersedes**: P7 [#28](https://github.com/chatondearu/fluffmind/issues/28) for now (deferred)

## Goal

Ship a **usable MVP** you can deploy and iterate on — not scale-out or static publishing.
Close the gap between “features shipped” and “product works end-to-end” (solo + multi-account).

## Exit criteria

- [x] Vault reads use the **active workspace** path (same as writes)
- [x] First signup **creates a workspace** automatically (no dead-end 403)
- [x] `GET /api/health` for Coolify/Docker readiness
- [x] Logout + login redirect preserve destination
- [x] Empty vault shows guided empty state
- [x] README / `.env.example` reflect P0–P6 shipped + Coolify checklist

## Deferred (post-MVP / P7)

- Distributed lock / multi-instance scale-out
- Static site export (Quartz-style)
- Full i18n, mobile layout, custom 404
- SMTP for invitation emails

## Issue breakdown

| Issue | Scope |
| ----- | ----- |
| #86 | Workspace-aware vault index + bootstrap |
| #87 | Signup onboarding workspace |
| #88 | Health check + compose healthcheck |
| #89 | Auth UX (logout, redirect) + empty state |
| #90 | MVP docs (README, Coolify guide) |
