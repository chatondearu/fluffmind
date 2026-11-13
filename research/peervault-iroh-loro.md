# Research: PeerVault / iroh / Loro for Markdown vaults

**Ticket:** [#145](https://github.com/chatondearu/fluffmind/issues/145) (parent [#141](https://github.com/chatondearu/fluffmind/issues/141))  
**Date:** 2026-11-13  
**Branch:** `research/peervault-iroh-loro`  
**Context:** [[foam/architecture/rethink-sync]] mesh-sync direction

Short findings only — no product recommendation ADR yet.

## Stack at a glance

| Piece | Role | Fit for MD vault |
| ----- | ---- | ---------------- |
| **iroh** | P2P transport (QUIC, relay fallback, tickets) | Networking only — not a vault model |
| **iroh-docs** | Multi-writer KV replica (path → blob hash), LWW per key | Sync *files as blobs*; concurrent edits do **not** merge text |
| **Loro** | CRDT state (Text / Tree / Map / List) + version history | Character-level merge + tree moves; transport-agnostic |
| **PeerVault** | Prior art: vault adapter around Loro + iroh | Closest end-to-end model for Obsidian-style vaults |

## What each actually gives

### iroh

- Direct peer connections when possible; otherwise n0 (or self-hosted) **relay**.
- Auth + E2E encryption at the transport layer; apps add their own app-level crypto if needed.
- Modular protocols: blobs, gossip, docs, custom ALPNs.
- **Browser:** Wasm + wasm-bindgen since ~0.33; browser nodes are **relay-only** (no UDP hole-punch). No official npm package — wrap a small Rust crate. Prefer native/NAPI on Node for full stack.
- **Self-host:** production apps usually keep a relay (shared, dedicated, or self-hosted). “No servers” means no *app* server for sync; relays still matter for NAT / browsers.

### iroh-docs

- Named document = CRDT **key → content-hash** map; bytes live in **iroh-blobs**; live hints via **iroh-gossip**.
- Sync uses range-based set reconciliation (cheap when already in sync).
- Conflict rule: **last-writer-wins** per key (timestamp, then hash). Concurrent edits to the same path = one whole value wins; the other is dropped.
- Good for: “many files, rare concurrent writers on the same path”, config, blob sync, agent dumps that overwrite a whole note.
- Bad for: two humans (or human + agent) editing the same markdown mid-paragraph — you lose the merge semantics FluffMind would want for wiki pages.
- Wasm build exists in recent `iroh-docs` releases; still not “markdown collaboration out of the box.”

### Loro

- Library, not a network: you exchange `export` / `import` bytes over any transport (iroh, websocket, S3, USB).
- **LoroText** (Fugue) for concurrent text; **LoroTree** for folder/file moves; maps/lists for frontmatter/tags.
- Snapshots + version vectors → incremental sync; history like a CRDT git.
- Does **not** understand wiki-links or the note graph — those stay derived indexes over plain text (same as today: parse `[[links]]` after materializing files).
- JS/Wasm and Rust crates; used in production collaborative apps. Official demo `loro-dev/iroh-loro` is still **2 peers × 1 plain-text file**.

### PeerVault ([robcohen/peervault](https://github.com/robcohen/peervault))

- P2P vault sync: **Loro CRDT + iroh transport**, optional encrypted S3 backup.
- Data model (their `spec/01-data-model`): **one LoroDoc per vault** — `LoroTree` for hierarchy, `LoroText` per file, frontmatter as structured maps/lists, soft-delete tombstones.
- Host-agnostic **`peervault-core`** (Rust): Obsidian plugin (WASM), VSCode, Zed via **`peervaultd`**, embed docs (`docs/EMBEDDING.md`). Host supplies file watch + apply `reconcile_plan`.
- Pairing tickets interop across hosts; E2E vault key on top of iroh.
- **Hard limits for us:** early project (~5★, active Nov 2026); Obsidian/Electron-first; browser path inherits iroh relay-only WASM; roadmap still chasing WebRTC for LAN; **not** a wiki-link/graph engine — only file sync. Embedding means adopting their vault CRDT schema or forking adapter work.

## Hard limits for FluffMind

| Constraint | Implication |
| ---------- | ----------- |
| **Browser UI** | Pure in-browser mesh is possible but relay-dependent and heavy (Wasm). Better fit with rethink-sync: **thin web client ↔ local/native daemon** (PeerVault’s `peervaultd` pattern) or server-side peer that browsers talk to over HTTP/WS. |
| **Self-host** | You can self-host relays and skip cloud; you do **not** get zero-ops NAT traversal for free. Multi-user auth/workspaces (current FluffMind) are orthogonal — mesh sync replaces live git lock, not Better Auth. |
| **Agent-written files** | Agents that `set(path, wholeContent)` map cleanly to Loro `set` / iroh-docs put. Risk: agents rewriting entire files while a human edits → Loro merges character ops if both go through CRDT; **byte-replace outside the CRDT** (raw FS write) can desync or thrash. Prefer ingest via the same API as the editor. Path-ownership (ADR direction in rethink-sync) still safest for agents. |
| **Wiki-links / graph** | None of these store a first-class link graph. Keep FluffMind’s derived index over materialized markdown. Moves/renames need CRDT tree ops (Loro) or careful key renames (iroh-docs) so link targets stay consistent. |
| **Many files** | PeerVault/Loro: single-doc vault scales with Loro’s tree+text design (their claimed win vs Automerge). iroh-docs: one entry per path scales as a KV set — fine for count, weak for concurrent text. History/tombstones grow; plan compaction/snapshots. |
| **Git** | Still useful as history/backup/GitHub interop (rethink-sync). Live sync on CRDT ≠ git; exporting plain files for git is an adapter step. |
| **Product ADR conflict** | Current editor ADR rejects CRDT *inside the block editor*. Mesh sync can still use Loro **under** the vault layer without TipTap/Yjs in the UI — keep that seam explicit. |

## Practical mapping (for #141)

1. **Want concurrent same-note editing** → Loro (PeerVault-shaped), not iroh-docs alone.
2. **Want path-owned agent dumps + rare human overlap** → iroh-docs (or even plain iroh-blobs + gossip) may be enough and simpler.
3. **Want browser-first P2P with no daemon** → expect relays + Wasm complexity; PeerVault proves Electron/WASM hosts, not a Nuxt SPA.
4. **Closest reusable prior art** → PeerVault’s core + daemon embed contract; treat as reference architecture, not a drop-in dependency until license/API stability checked.

## Sources

- PeerVault README, `spec/01-data-model.md`, `docs/EMBEDDING.md`, `ROADMAP.md` (fetched 2026-11-13)
- [iroh docs](https://docs.iroh.computer/), [Documents / iroh-docs](https://docs.iroh.computer/protocols/documents), [Wasm/browser](https://docs.iroh.computer/languages/wasm-browser)
- [loro.dev](https://loro.dev/), [Sync tutorial](https://loro.dev/docs/tutorial/sync), [loro-dev/iroh-loro](https://github.com/loro-dev/iroh-loro)
- FluffMind: `foam/architecture/rethink-sync.md`, ADR-008 (no CRDT in editor)
