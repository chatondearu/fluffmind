# Architecture

Fluffmind's founding principle: **plain markdown files in a Git repo are the only source of truth for note content.**

Postgres may hold identity, workspace membership, and sync bookkeeping — but **never note content**. If the database is lost, notes remain fully recoverable from Git.

Only the server touches Git. Clients (browser, MCP agents) call HTTP APIs; a single server-side writer (`writeToWorkspace`) holds the lock, applies changes, commits, and pushes. There is no second Git writer on the client.

For the full design rationale, see [DESIGN.md on GitHub](https://github.com/chatondearu/fluffmind/blob/main/DESIGN.md).
