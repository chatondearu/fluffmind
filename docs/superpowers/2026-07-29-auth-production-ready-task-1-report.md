# Task 1 report — auth production-ready

## Changes

Committed in `1f55dce` (`feat(web): gate public signup behind invite-only mode`):

- `apps/web/app/utils/signup-access.ts`: pure helpers for internal redirects, invitation redirects, and signup access.
- `apps/web/app/utils/signup-access.test.ts`: invite-only and public-signup unit coverage.
- `apps/web/app/middleware/auth.global.ts`: invite-only `/signup` gating and explicit auth redirect reasons.
- `apps/web/nuxt.config.ts`: public `authPublicSignupEnabled` runtime configuration from `AUTH_PUBLIC_SIGNUP`.

This report is intentionally not part of the Task 1 commit so that the commit contains only the files listed by the plan.

## Tests run

### RED

Command:

```sh
pnpm --filter @fluffmind/web run test -- app/utils/signup-access.test.ts
```

Output: exit code 1, with the expected missing-module failure:

```text
FAIL  app/utils/signup-access.test.ts [ app/utils/signup-access.test.ts ]
Error: Cannot find module './signup-access' imported from '/cda/dev/fluffmind/apps/web/app/utils/signup-access.test.ts'

Test Files  1 failed | 14 passed (15)
Tests  70 passed (70)
```

### GREEN

Command:

```sh
pnpm --filter @fluffmind/web run test -- app/utils/signup-access.test.ts
```

Output: exit code 0:

```text
✓ app/utils/signup-access.test.ts (4 tests) 1ms
✓ app/utils/graph-neighborhood.test.ts (6 tests) 2ms
✓ server/utils/github-webhook.test.ts (4 tests) 2ms
✓ server/utils/github-token-crypto.test.ts (2 tests) 3ms
✓ server/vault/readonly.test.ts (5 tests) 3ms
✓ app/utils/note-autosave.test.ts (6 tests) 5ms
✓ app/utils/note-source.test.ts (5 tests) 7ms
✓ server/utils/github-installations.test.ts (7 tests) 5ms
✓ app/utils/vault-tree.test.ts (6 tests) 8ms
✓ server/vault/lock.test.ts (10 tests) 229ms
✓ server/utils/github-credentials.test.ts (4 tests) 3ms
✓ server/utils/github-create-repo.test.ts (4 tests) 4ms
✓ server/vault/parser.test.ts (3 tests) 8ms
✓ server/vault/workspace.test.ts (2 tests) 2ms
✓ server/mcp/handlers.test.ts (6 tests) 680ms

Test Files  15 passed (15)
Tests  74 passed (74)
Duration  1.71s
```

The package script forwards an extra `--` to Vitest, so Vitest ran the complete web test suite in addition to the requested helper file.

## Additional verification

Scoped ESLint:

```sh
pnpm exec eslint app/utils/signup-access.ts app/utils/signup-access.test.ts app/middleware/auth.global.ts nuxt.config.ts
```

Output: no output, exit code 0.

Nuxt typecheck:

```sh
pnpm --filter @fluffmind/web run typecheck
```

Output: exit code 0:

```text
$ nuxt typecheck

WARN  Duplicated imports "getSession", the one from "h3" has been ignored and "/cda/dev/fluffmind/apps/web/server/utils/auth.ts" is used
```

## Concerns and blockers

- No blocker for Task 1.
- The full web lint command (`pnpm --filter @fluffmind/web run lint`) exits with code 1 because of six pre-existing errors outside the Task 1 files:
  - two `@typescript-eslint/no-dynamic-delete` errors in `NoteFrontmatterPanel.vue`;
  - one unused variable in `VaultTreeItem.vue`;
  - one unused import in `KanbanBoard.vue`;
  - one unused variable in `pages/settings/index.vue`;
  - one `import/first` error in `server/utils/github-credentials.test.ts`.
- The checkout was already two commits behind `origin/main`; no pull or rebase was performed because it was outside Task 1.
