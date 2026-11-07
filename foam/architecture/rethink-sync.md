# Rethink: simplify sync (Rust + mesh)

#architecture #data

- **Status**: idea — to revisit when Fluffmind work resumes
- **Date**: 2026-10-31
- **Origin**: owner note while designing a decentralized agent with shared memory

## Why

Fluffmind is meant to replace Notion, but the Git layer grew too complex. Server-side
single writer ([[../decisions/ADR-002-server-side-git-sync|ADR-002]]) needed a distributed
lock ([[../decisions/ADR-007-distributed-workspace-lock|ADR-007]]), Postgres, a GitHub App
([[../decisions/ADR-009-github-app-installations|ADR-009]]) and a stack of admin repair
tools ([[../decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]],
[[../decisions/ADR-014-admin-github-panel|ADR-014]]: reset-hard, orphan vault rebind,
stale index invalidation, session repair). Most recent work fixes sync, not the product.

## Directions to evaluate

1. **Avoid conflicts by layout, not by locks.** Each writer owns its own paths (one folder
   per device/agent); shared pages only through an explicit merge step. Plain
   `git pull --rebase` then cannot conflict.
2. **Derived index, never stored.** Always rebuild the search index locally from files.
3. **Rust sync engine** as a small daemon/binary instead of Node + server orchestration.
4. **Mesh sync** for multi-device without a central server: [iroh](https://docs.iroh.computer/)
   (P2P QUIC, relay fallback) + a CRDT ([Loro](https://loro.dev/) or `iroh-docs`) for
   pages edited by several people. Prior art: [peervault](https://github.com/robcohen/peervault)
   (Loro + iroh, Obsidian vaults).
5. Keep Git as **history/backup and GitHub interop**, not as the live sync protocol.

## Open questions

- Can the web UI stay a thin client over a local Rust daemon (portable solo mode)?
- Which pages need real concurrent editing (CRDT) vs single-owner files?
- Does multi-user auth/workspaces stay in scope, or move to a separate hosted layer?

Related: the decentralized agent project (shared memory between a primary "brain" and
local nodes) may share the same sync engine.
