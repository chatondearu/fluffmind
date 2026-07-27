# Agent conventions

Coding agents should read the **closest `AGENTS.md`** to whatever they edit — root `AGENTS.md` plus package-specific files such as `apps/web/AGENTS.md` or `packages/design-system/AGENTS.md`.

**TypeScript import extensions differ by context:**

- In `packages/*` (outside `apps/web`), imports need explicit `.ts` extensions (e.g. `./md3.ts`) because those packages run via `node --experimental-strip-types`.
- In `apps/web`, imports must be **extensionless** (`./parser`, not `./parser.ts`) or `nuxt typecheck` fails with `TS5097`.

When in doubt, match sibling files in the same directory.

Full repo conventions and gotchas: [AGENTS.md on GitHub](https://github.com/chatondearu/fluffmind/blob/main/AGENTS.md).
