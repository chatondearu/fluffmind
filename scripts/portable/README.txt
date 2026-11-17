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
  --readonly       Reject vault mutations (sets VAULT_READONLY=true; also skips the sync daemon)
  --no-open        Do not open a browser
  --no-daemon      Do not start the sync daemon (Git-live solo, as before)
  --daemon-port <n>  Sync daemon port on 127.0.0.1 (default: 8787)

Requirements:
  - Git must be installed and available on PATH
  - No Docker or Postgres needed (solo mode)

Point at an existing Foam/Obsidian vault:
  ./bin/fluffmind start --vault /path/to/your/vault

Read-only (browse without writing):
  ./bin/fluffmind start --vault /path/to/your/vault --readonly

Sync daemon: bin/fluffmind-daemon starts on 127.0.0.1 before the app and stops with it.
Notes you save land under <vault>/writers/device/solo/…; no Git commit per save.
Its key and mesh state live in ./data/daemon, its log in ./data/fluffmind-daemon.log.
A crashed launcher can leave it running: the next start/stop reaps it.

Background PID/log live in ./data/fluffmind.pid and ./data/fluffmind.log.
Data / lock files live in ./data (not inside your vault git tree).
