Fluffmind — portable solo package
=================================

Run in the background (recommended — no terminal needed):
  ./bin/fluffmind start              # macOS / Linux
  bin\fluffmind.cmd start            # Windows

  ./bin/fluffmind status
  ./bin/fluffmind stop

Foreground (keeps the terminal open):
  ./bin/fluffmind
  ./bin/fluffmind run

Options (work with run/start):
  --vault <path>   Vault folder (default: ./vault next to this package)
  --port <n>       Port (default: 3000)
  --host <addr>    Bind address (default: 127.0.0.1)
  --readonly       Reject vault mutations (sets VAULT_READONLY=true)
  --no-open        Do not open a browser

Requirements:
  - Git must be installed and available on PATH
  - No Docker or Postgres needed (solo mode)

Point at an existing Foam/Obsidian vault:
  ./bin/fluffmind start --vault /path/to/your/vault

Read-only (browse without writing):
  ./bin/fluffmind start --vault /path/to/your/vault --readonly

Background PID/log live in ./data/fluffmind.pid and ./data/fluffmind.log.
Data / lock files live in ./data (not inside your vault git tree).
