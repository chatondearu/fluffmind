/**
 * Stable snapshot used to skip autosave when nothing meaningful changed.
 */
export function autosaveSnapshot(payload: {
  content: string
  frontmatter?: Record<string, unknown>
}): string {
  return JSON.stringify({
    content: payload.content,
    frontmatter: payload.frontmatter ?? {},
  })
}

export function shouldAutosave(nextSnapshot: string, lastSnapshot: string | null): boolean {
  return nextSnapshot !== lastSnapshot
}

export function frontmatterEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}
