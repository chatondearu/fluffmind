# GitHub sync & authentication

Fluffmind uses two GitHub integrations for separate jobs:

| Integration | Environment variables | Role |
| ----------- | --------------------- | ---- |
| **OAuth App** | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | User **login** only |
| **GitHub App** | `GITHUB_APP_*` | **Repository access** for workspaces (clone, push, and collaborator sync) |

## OAuth App for login

To let users sign in with GitHub, create a GitHub **OAuth App** *or* use the
**Client ID / Client secret** of your GitHub App (see [GitHub App setup](./github-app-setup)),
and configure:

```sh
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

Set the authorization **Callback URL** (OAuth App, or the GitHub App “Callback URL”
field) to:

```text
{BETTER_AUTH_URL}/api/auth/callback/github
```

Example: `https://fluffmind.example.com/api/auth/callback/github`.

If you use a **GitHub App** for login credentials, also grant **Account permissions →
Email addresses → Read-only**. When GitHub still omits an email (private address /
missing permission), Fluffmind synthesizes `{id}+{login}@users.noreply.github.com`
so sign-in can complete.

## GitHub App for repository access

A GitHub App is optional. It lets an organization administrator install access once,
then lets workspace owners bind repositories without storing a personal access token
for each workspace. See [GitHub App setup](./github-app-setup).

## Webhooks

Configure GitHub webhooks to send requests to:

```text
POST {BETTER_AUTH_URL}/api/webhooks/github
```

When using a GitHub App, subscribe to push, installation, and installation repository
events.

## Personal access token fallback

If no GitHub App is configured, workspace owners can still link a repository with a
personal access token (PAT). Configure `GITHUB_SYNC_TOKEN_SECRET` to encrypt PAT links
at rest.

## Exclusive sync modes

Each workspace has **one** active sync mode at a time:

| Mode | Meaning |
| ---- | ------- |
| **GitHub App** | Linked via an installed GitHub App |
| **PAT** | Linked with a personal access token |
| **Local only** | No `workspace_github_link` and no `gitRemoteUrl` |

To switch modes, **unlink** the current sync first
(`DELETE /api/workspaces/github/link?workspaceId=<id>`),
then choose App or PAT again. Linking while another mode is active returns **409**.

### At workspace creation

When the GitHub App is installed, the “New workspace” dialog offers:

- **Create a GitHub repository** — creates `fluff-<slug>` (or a custom name) via the App and links it
- **Link an existing repository** — pick a repo from an App installation; the new empty vault clones that remote on first use
- **Local only** — no GitHub binding (you can link later from workspace settings)

If GitHub creation or linking fails, the workspace is still created; the app shows a warning banner so you can retry from workspace settings.
