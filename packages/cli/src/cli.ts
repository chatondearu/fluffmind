// Entry point for the `fluffmind` CLI. Argument parsing and subcommands
// (whoami, search, read, write, backlinks, graph, task, config) land in a
// follow-up task — this scaffold only wires the executable shape.
export async function main(argv: string[]): Promise<number> {
  const suffix = argv.length > 0 ? ` (got: ${argv.join(' ')})` : ''
  console.log(`fluffmind: no commands are wired up yet — coming in a follow-up task.${suffix}`)
  return 0
}
