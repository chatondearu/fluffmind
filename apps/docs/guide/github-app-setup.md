# GitHub App setup

Fluffmind uses two GitHub integrations on purpose:

| Integration | Environment variables | Role |
| ----------- | --------------------- | ---- |
| **OAuth App** | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | User **login** only |
| **GitHub App** | `GITHUB_APP_*` | **Repository access** for workspaces (clone, push, and collaborator sync) |

With a GitHub App configured, an organization administrator installs it once, then
each Fluffmind **workspace** binds **one repository** under Settings → workspace
(App mode). No personal access token is needed per workspace. One installation can
back many workspaces, with one repository per workspace.

> **Today:** Fluffmind **links** an existing repository (create the empty repository
> on GitHub first, or choose an existing vault repository). Auto-creating a new GitHub
> repository when you create a Fluffmind workspace is **not** shipped yet.

## 1. Create the GitHub App

1. Go to GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**.
   Create it under the user or organization that will own the App credentials for this
   Fluffmind instance.
2. Set the **GitHub App name** and slug. Keep the slug for `GITHUB_APP_SLUG`.
3. Set the **Homepage URL** to your public Fluffmind URL (`BETTER_AUTH_URL`).
4. Configure the webhook:
   - Active: yes
   - Webhook URL: `https://<your-fluffmind-host>/api/webhooks/github`
   - Webhook secret: generate one, then set `GITHUB_APP_WEBHOOK_SECRET` (preferred) or
     `GITHUB_WEBHOOK_SECRET`.
5. Grant these repository permissions:

   | Permission | Access | Why |
   | ---------- | ------ | --- |
   | Contents | Read & write | Clone, commit, and push the vault |
   | Metadata | Read | Required by GitHub |
   | Members (or collaborate through the repository collaborators API) | Read | Hybrid role sync |

   Subscribe to the **Push**, **Installation**, and **Installation repositories**
   events.
6. Create the App and record its **App ID** for `GITHUB_APP_ID`.
7. Generate a private key, download the `.pem` file, and store it as
   `GITHUB_APP_PRIVATE_KEY`. In Coolify or `.env`, put the PEM on one line with `\n`
   for newlines.
8. Under **Install App**, install it on the organization or user after setting the
   Fluffmind environment. You can also use Fluffmind Settings →
   **Installer l’application** once `GITHUB_APP_SLUG` is set.

## 2. Configure Coolify or the environment

Set these variables on the Fluffmind instance, in addition to Better Auth and OAuth
login variables:

```sh
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret
```

Redeploy the instance. `GET /api/github/app/status` reports `configured` when the App
ID and private key are present.

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
