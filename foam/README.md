# Project memory (Foam)

Structured project memory for humans and AI agents. **Start at
[`index.md`](index.md).**

## Layout

```
foam/           # Knowledge graph (wikilinks)
  decisions/    # Architecture Decision Records (ADRs)
  product/      # Vision, rules
  features/     # Shipped / backlog (sync via import-kanban.sh)
  architecture/ # Topic guides linked to ADRs
prd/            # Product Requirements Documents
plans/          # Implementation plans
```

## Bootstrap

Installed via skill `foam-project-memory`. Repo-local scripts:

```bash
bash scripts/import-kanban.sh    # refresh foam/features/shipped.md + backlog.md
./scripts/gh-board.sh events     # GitHub Projects board (see .github/kanban.env)
```

## Workflows

See skill `foam-project-memory` and project `AGENTS.md` § Project memory.
