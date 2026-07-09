export const SAMPLE_BOARD = `---
kanban-plugin: board
---

## To Do
- [ ] Buy groceries
- [ ] Write documentation

## In Progress
- [ ] Build the thing

## Done
- [x] Set up project
`

export const SAMPLE_WITH_SUFFIX = `---
kanban-plugin: board
---

## Backlog
- [ ] Task A

%% kanban:settings
{"kanban-plugin":"board"}
%%
`
