# ADR-009 — GitHub App installations for repo access (self-hosted)

- **Status**: accepted
- **Date**: 2026-07-24
- **Tags**: #architecture #auth #github

## Context

P2 (ADR-006) links workspaces to GitHub with a per-workspace PAT for collaborator sync
and (via remote URL + token) git operations. That is awkward for organizations that
want one Fluffmind instance to manage several vaults across several repos.

GitHub OAuth App credentials already handle **user login**. They are the wrong tool for
**multi-repo installation access** with short-lived, narrowly scoped server tokens.

## Decision

- Each **self-hosted Fluffmind instance** configures its **own** GitHub App
  (`GITHUB_APP_ID`, private key, webhook secret).
- Repo access uses **installation access tokens** when a workspace is linked in
  `authMode=app`.
- Model: one GitHub installation → many workspaces; one workspace → one repository.
- **PAT linking remains** as fallback when the App is not configured or the owner
  chooses `authMode=pat`.
- Hybrid collaborator → role sync from ADR-006 is unchanged.
- OAuth login (`GITHUB_CLIENT_ID` / `SECRET`) is unchanged.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Official single Fluffmind marketplace App | Conflicts with self-host ownership of credentials; SaaS follow-up only |
| App for collaborator sync only; git stays PAT/deploy key | Leaves the main operational pain (N secrets for push) |
| Replace PAT immediately / no fallback | Breaks existing deployments without App setup |
| User OAuth token as sync credential only | Weaker install UX; refresh/consent issues; not org-install shaped |

## Consequences

- **Positive**: Org-friendly multi-repo binding; short-lived tokens; clearer permissions.
- **Negative**: Operators must create and maintain a GitHub App; more webhook surface.
- **Constraint**: Do not persist long-lived installation tokens; mint on demand.
- **Constraint**: Server remains the only Git writer (ADR-002).

## References

- [[ADR-006-better-auth-workspaces|ADR-006]]
- [[../../prd/PRD-033-github-app-installations|PRD-033]]
- `docs/superpowers/specs/2026-07-24-github-app-installations-design.md`
