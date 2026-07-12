export function reorderBlocksById<T extends { id: string }>(
  blocks: readonly T[],
  fromId: string,
  toId: string,
): T[] {
  const from = blocks.findIndex(block => block.id === fromId)
  const to = blocks.findIndex(block => block.id === toId)
  if (from === -1 || to === -1 || from === to) {
    return [...blocks]
  }

  const copy = [...blocks]
  const [moved] = copy.splice(from, 1)
  if (!moved) {
    return [...blocks]
  }

  let insertAt = to
  if (from < to) {
    insertAt = to - 1
  }
  copy.splice(insertAt, 0, moved)
  return copy
}
