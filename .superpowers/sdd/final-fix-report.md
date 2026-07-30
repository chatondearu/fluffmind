## 2026-07-30 — Content-roots final review fixes

- Reused the early validated content-roots update after GitHub operations, avoiding a second workspace `SELECT`.
- Persisted provided roots after a soft GitHub create-and-link failure.
- Removed the duplicate folder-route content-root error mapping.
- Verified: `pnpm --filter @fluffmind/web exec vitest run server/utils/content-roots-config.test.ts server/vault/content-roots.test.ts` (12 tests passed).
