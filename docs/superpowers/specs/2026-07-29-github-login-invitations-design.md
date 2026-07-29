# Invite workspace members by GitHub login — Design

**Date:** 2026-07-29  
**Status:** approved (product design)  
**ADR:** extends `foam/decisions/ADR-006-better-auth-workspaces.md` and
`foam/decisions/ADR-009-github-app-installations.md` (no new ADR unless accept-path
diverges from Better Auth enough to warrant one)  
**Related:** PRD-035 (invite-only + shareable links), hybrid member sync (ADR-006)

## Problem

Workspace invitations today are **email-only** via Better Auth
`organization.inviteMember`. GitHub-centric teams often know a **login**, not a
corporate email. GitHub OAuth may also store a noreply address
(`{id}+{login}@users.noreply.github.com`), so email matching alone is fragile.

Operators already have GitHub App installations (org or user) and/or a linked repo.
They need to invite by selecting org members / repo collaborators, or by typing a
GitHub username, while keeping email invites and shareable accept links.

## Goals

1. Invite a workspace member by **GitHub login** (typed or picked from a list).
2. Keep **email** invites in the same Settings UI block.
3. Candidate list: **org members** when the App is installed on an Organization;
   **repo collaborators** as fallback when only a user install / linked repo is
   available.
4. Accept path: match on **resolved email if present**, else on **linked GitHub
   account** (`provider=github` + login / user id).
5. Preserve shareable `/accept-invitation/<id>` links without requiring SMTP.

## Non-goals

- SMTP / transactional email delivery
- Auto-adding all org members without an explicit invite (hybrid sync of repo
  collaborators for *already linked* Fluffmind users remains ADR-006)
- Instance-admin (`/settings/admin`) invites — stays workspace-scoped
- Replacing Better Auth organization invitations for the email path
- Inviting by GitHub user id alone in the UI (id is stored when resolved, not typed)

## Decisions

| Topic | Choice |
| ----- | ------ |
| UX | One invite block: GitHub autocomplete + free login field + email field + role |
| Matching on accept | Prefer resolved email; always allow GitHub account match (approach C) |
| Candidate source | Org members if Organization installation; else linked-repo collaborators |
| Persistence | Fluffmind `github_invitation` (or equivalent) alongside Better Auth email invites |
| When email is resolved | Also create Better Auth invitation; store cross-link id |
| When email is not resolved | GitHub-only invitation; accept requires GitHub login match |
| Duplicate pending | Reuse / return existing link; do not create a second pending invite |
| Token for GitHub API | Installation token (`authMode=app`) or workspace PAT (`authMode=pat`) |

## Architecture

```
Settings > workspace  “Inviter un membre”
        │
        ├─ email only ──► Better Auth inviteMember (unchanged) ──► shareable link
        │
        └─ github login (typed or selected)
                │
                ├─ resolve GitHub user (login, id; optional email)
                ├─ upsert github_invitation row
                ├─ if resolvedEmail → also Better Auth inviteMember
                └─ return shareable accept URL
                        │
                        ▼
              /accept-invitation/<id>
                        │
                        ├─ session email matches resolvedEmail / BA invitation email
                        └─ OR linked github account matches githubLogin / githubUserId
```

### Data model

Table `github_invitation` (name flexible; keep under `packages/db` schema):

| Column | Notes |
| ------ | ----- |
| `id` | Primary key; may be the accept-route id for GitHub-only invites |
| `organizationId` | Workspace / Better Auth org |
| `githubLogin` | Normalized lowercase |
| `githubUserId` | Nullable string/number from GitHub API |
| `resolvedEmail` | Nullable; lowercase when set |
| `betterAuthInvitationId` | Nullable FK-ish to BA `invitation.id` |
| `role` | `read` \| `write` \| `owner` |
| `status` | `pending` \| `accepted` \| `canceled` \| `expired` |
| `inviterId` | User who invited |
| `expiresAt` | Align with Better Auth invitation TTL |
| `createdAt` | |

Email-only invites continue to live only in Better Auth `invitation` (no mandatory
row in `github_invitation`).

### Accept identity

Accept succeeds when the signed-in user matches **any** of:

1. `user.email` equals `resolvedEmail` or the Better Auth invitation email.
2. `account` row with `providerId = 'github'` and
   `lower(accountId) = githubLogin` **or** `accountId` / profile id equals
   `githubUserId` (whichever the app already stores for GitHub OAuth — today sync
   resolves by login; prefer login match, use id as secondary when stored).

Otherwise return a clear error: connect with the invited GitHub account `@login`.

If the accept URL points at a Better Auth invitation id only (email path), keep
current `organization.acceptInvitation` behavior.

### Candidate listing

`GET` (workspace owner / manage role) e.g.
`/api/workspaces/github/invite-candidates`:

1. If workspace (or selected installation) is an **Organization** App install with
   Members: Read → list org members (`login`, `id`, avatar optional).
2. Else if workspace has a linked repo → list **collaborators** (existing
   `fetchCollaborators` pattern).
3. Else → empty list + UI hint; free-text login and email still work.
4. Exclude users already workspace members; mark or exclude pending invitees.

## API (sketch)

| Method | Purpose |
| ------ | ------- |
| `GET /api/workspaces/github/invite-candidates` | Org members or collaborators |
| `POST /api/workspaces/invitations` (or extend existing invite helper) | Create email and/or GitHub invitation; returns `{ invitationId, url, kind }` |
| Accept route | Extend `/accept-invitation/[id]` to resolve BA **or** `github_invitation` |

Exact route names can follow existing `apps/web/server/api/workspaces/**` style in
the implementation plan.

## UI

On `apps/web/app/pages/settings/workspace.vue`:

- Autocomplete “Membres GitHub” when candidates are available; otherwise disabled
  with a short explanation.
- Free-text GitHub login (`octocat` or `@octocat`).
- Email field (current).
- Role select + Invite.
- Submit requires at least one of: email, github login, or selected candidate.
- Invitations list shows email and/or `@login`.
- Success still shows copyable accept link (PRD-035).

## Error handling

| Case | Behavior |
| ---- | -------- |
| Unknown GitHub login | 404 with actionable message |
| Already a member | 409 |
| Pending invite same login/email | Return existing shareable link |
| No App/PAT for candidate list | Hide/disable autocomplete; manual login + email OK |
| Accept wrong account | Instruct to sign in as `@login` |
| Expired | Same expiry semantics as Better Auth invites |

## Testing

- Resolve login → optional email → enriched invitation row
- Accept via resolved email
- Accept via linked GitHub account when email missing
- Reject when neither matches
- Candidates: org members preferred; collaborators fallback
- UI submit paths: email-only, github-only, list selection
- Duplicate pending invite returns same link

## Accept URL identity (resolved)

- **Email-only:** URL uses Better Auth `invitation.id` (today’s behavior).
- **GitHub + resolved email:** create BA invitation first; public id =
  `invitation.id`; `github_invitation.betterAuthInvitationId` points at it;
  accept looks up BA id, then loads linked `github_invitation` for login match.
- **GitHub-only (no email):** public id = `github_invitation.id`; accept does
  not call BA `acceptInvitation` until/unless a parallel BA row exists.

Accept page/handler: try Better Auth invitation by id, else `github_invitation`
by id.

## Open implementation notes

1. Org member email access may require additional GitHub scopes/permissions; treat
   email as best-effort and never block invite creation when email is missing.
2. If accept-path customization cannot hook into Better Auth cleanly, a thin
   Fluffmind accept endpoint that then calls membership APIs is acceptable — call
   out in the plan and consider a short ADR addendum.

## Success criteria

- An owner can invite `@login` without knowing an email and get a shareable link.
- Invitee signing in with that GitHub account can accept and join the workspace.
- Email invites and invite-only signup (PRD-035) keep working unchanged.
- Org-installed App yields a selectable member list; otherwise collaborators or
  manual login.
