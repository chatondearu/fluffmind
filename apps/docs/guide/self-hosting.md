# Self-hosting

Use `docker-compose.coolify.yml` as a Coolify **Docker Compose** resource.
`DATABASE_URL` is wired automatically to the Compose Postgres service, so you normally
only set the variables below in Coolify’s Environment UI.

## Solo mode

For the fastest deployment, leave `AUTH_DISABLED=true` (the default), optionally set
`GIT_REMOTE_URL`, then deploy.

## Multi-account mode

To enable Better Auth, configure the following variables:

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `AUTH_DISABLED` | yes | `false` |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 random bytes (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | Public URL, for example `https://fluffmind.example.com` (no trailing slash) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for GitHub login | GitHub **OAuth App** (identity) |
| `GITHUB_SYNC_TOKEN_SECRET` | recommended | Encrypts workspace PAT links at rest |

Set the GitHub OAuth App callback URL to:

```text
{BETTER_AUTH_URL}/api/auth/callback/github
```

The first signup on an empty instance becomes an admin and can create the first
workspace.

## GitHub App (optional)

For multi-workspace and multi-repository autonomy without pasting personal access
tokens, configure a GitHub App. Follow the dedicated
[GitHub App setup](./github-app-setup) guide.

## Webhooks, schema, and health checks

Point GitHub webhooks at:

```text
POST {BETTER_AUTH_URL}/api/webhooks/github
```

Subscribe to push and installation events when using a GitHub App.

After deployment, run Drizzle migrations against Postgres whenever new SQL migrations
land under `packages/db/drizzle/` (for example, `0001_*` for GitHub App link columns).

Use `GET /api/health` as the health check endpoint; it is also used by the Docker
health check.
