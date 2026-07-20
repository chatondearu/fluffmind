Fluffmind — portable solo package
=================================

Run (macOS / Linux):
  ./bin/fluffmind

Run (Windows):
  bin\fluffmind.cmd

Options:
  --vault <path>   Vault folder (default: ./vault next to this package)
  --port <n>       Port (default: 3000)
  --host <addr>    Bind address (default: 127.0.0.1)
  --no-open        Do not open a browser

Requirements:
  - Git must be installed and available on PATH
  - No Docker or Postgres needed (solo mode)

Point at an existing Foam/Obsidian vault:
  ./bin/fluffmind --vault /path/to/your/vault

Data / lock files live in ./data (not inside your vault git tree).
