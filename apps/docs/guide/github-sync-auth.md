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

> **Today:** Fluffmind **links** an existing repository. Auto-creating a new GitHub
> repository when you create a Fluffmind workspace is **not** shipped yet.
