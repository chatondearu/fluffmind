# Monorepo layout

#architecture

```
apps/web/                 Nuxt app (UI + Nitro server)
packages/design-system/   Reka UI + UnoCSS + MD3 tokens
packages/editor-blocks/   Custom block editor shell (P3)
packages/integrations/    Git plumbing, GitHub API (P2/P5)
packages/db/              Drizzle + Better Auth (P2)
```

Vault parsing and indexing intentionally live in `apps/web/server/vault/` until a second
consumer exists — [[../decisions/ADR-004-vault-engine-colocated|ADR-004]].

Design tokens vs Vue components use separate package entry points —
[[../decisions/ADR-005-design-system-dual-entry|ADR-005]].
