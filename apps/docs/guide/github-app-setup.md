# GitHub App setup

Fluffmind uses two GitHub integrations on purpose:

| Integration | Environment variables | Role |
| ----------- | --------------------- | ---- |
| **OAuth credentials** (GitHub App Client ID/secret, or a separate OAuth App) | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | User **login** only — callback `{BETTER_AUTH_URL}/api/auth/callback/github` |
| **GitHub App** | `GITHUB_APP_*` | **Repository access** for workspaces (clone, push, and collaborator sync) |

With a GitHub App configured, an organization administrator installs it once, then
each Fluffmind **workspace** binds **one repository** under Settings → workspace
(App mode). No personal access token is needed per workspace. One installation can
back many workspaces, with one repository per workspace.

> After changing permissions on GitHub, **re-approve / update** the App installation so
> the new scopes take effect on existing orgs.

## Required permissions checklist

### Repository permissions

| Permission | Access | Required | Why |
| ---------- | ------ | -------- | --- |
| **Contents** | Read & write | yes | Clone, commit, and push the vault |
| **Metadata** | Read-only | yes | Required by GitHub for every App |
| **Members** | Read-only | yes | Hybrid collaborator → workspace role sync |
| **Administration** | Read & write | recommended | Create a GitHub repository when creating a workspace |

### Account permissions

| Permission | Access | Required | Why |
| ---------- | ------ | -------- | --- |
| **Email addresses** | Read-only | recommended | GitHub login with a real email (`GITHUB_CLIENT_*` from this App). Without it, Fluffmind falls back to `{id}+{login}@users.noreply.github.com`. |

### Webhook events

Subscribe to:

- **Push**
- **Installation**
- **Installation repositories**

Webhook URL: `https://<your-fluffmind-host>/api/webhooks/github`

Fluffmind **Settings** shows a live checklist (`GET /api/github/app/status`) with ✓ / ○
for each permission once `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are set.

## 1. Create the GitHub App

1. Go to GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**.
   Create it under the user or organization that will own the App credentials for this
   Fluffmind instance.
2. Set the **GitHub App name** and slug. Keep the slug for `GITHUB_APP_SLUG`.
3. Set the **Homepage URL** to your public Fluffmind URL (`BETTER_AUTH_URL`).
4. Set the **Callback URL** (user authorization / OAuth callback) to:

   ```text
   {BETTER_AUTH_URL}/api/auth/callback/github
   ```

   Example: `https://fluffmind.example.com/api/auth/callback/github`.

   This URL is required for **GitHub login** in Fluffmind (Better Auth). After creating
   the App, copy its **Client ID** and generate a **Client secret**, then set them as
   `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` on the instance.

   Grant the **Account → Email addresses → Read-only** permission (see checklist above).

   You may instead create a separate GitHub **OAuth App** for login only; use the same
   callback URL on that OAuth App. Do not leave the callback empty if users should be
   able to sign in with GitHub.

   Optional: enable **Request user authorization (OAuth) during installation** if you
   want GitHub to prompt for user identity when the App is installed.
5. Configure the webhook (URL + secret) and grant the **repository** permissions from
   the checklist above.
6. Create the App and record its **App ID** for `GITHUB_APP_ID`.
7. Generate a private key, download the `.pem` file, and store it as
   `GITHUB_APP_PRIVATE_KEY`. In Coolify or `.env`, put the PEM on one line with `\n`
   for newlines.
8. Under **Install App**, install it on the organization or user after setting the
   Fluffmind environment. You can also use Fluffmind Settings →
   **Installer l’application** once `GITHUB_APP_SLUG` is set.

## 2. Configure Coolify or the environment

Set these variables on the Fluffmind instance, in addition to Better Auth:

```sh
# Login (Client ID / secret from the GitHub App, or from a separate OAuth App)
GITHUB_CLIENT_ID=Iv1.xxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxx
# Callback URL configured on GitHub must be: {BETTER_AUTH_URL}/api/auth/callback/github

# Repository access (GitHub App)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret
```

Redeploy the instance. Open **Paramètres** in Fluffmind: the **GitHub App — permissions**
card calls `GET /api/github/app/status` and shows ✓ / ○ for credentials and each
permission. GitHub login appears on `/login` when `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` are set.

## 3. Install on the organization and bind repositories

1. Sign in as a workspace **owner**.
2. Open **Settings → workspace**. If the App is configured, use
   **Installer l’application**, or open
   `https://github.com/apps/<slug>/installations/new`.
3. On GitHub, choose the organization or user and the repositories that the App may
   access: all repositories, or a selected set.
4. Back in Fluffmind, select **Actualiser les installations**, then pick an
   installation and **one repository per workspace**. Link it in App mode.
5. For each additional workspace, create the vault workspace in Fluffmind, ensure the
   target GitHub repository exists and is included in the App's repository access, then
   bind it the same way.

After linking, collaborator sync and Git push/pull use short-lived installation tokens;
no PAT is stored for that workspace. The PAT fallback remains available when the App is
not configured.

See [ADR-009](https://github.com/chatondearu/fluffmind/blob/main/foam/decisions/ADR-009-github-app-installations.md)
and [PRD-033](https://github.com/chatondearu/fluffmind/blob/main/prd/PRD-033-github-app-installations.md).
