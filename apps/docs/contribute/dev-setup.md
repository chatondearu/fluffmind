# Dev setup

```sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev
```

Useful root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm docs:dev`.

Point `VAULT_PATH` at any Foam/Obsidian-style markdown folder. See root `AGENTS.md` for env vars (`AUTH_DISABLED`, `WORKSPACES_ROOT`, GitHub App keys, etc.).
