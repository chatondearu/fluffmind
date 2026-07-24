export interface GraphEdgeLike {
  source: string
  target: string
}

export function computeDegrees(edges: GraphEdgeLike[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const edge of edges) {
    if (edge.source === edge.target) {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1)
      continue
    }
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1)
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1)
  }
  return degrees
}

export function neighborsOf(id: string, edges: GraphEdgeLike[]): Set<string> {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.source === id && edge.target !== id)
      neighbors.add(edge.target)
    else if (edge.target === id && edge.source !== id)
      neighbors.add(edge.source)
  }
  return neighbors
}

export function activeSeed(
  focusedId: string | null,
  hoveredId: string | null,
): string | null {
  return focusedId ?? hoveredId
}

export function nodeRadius(
  degree: number,
  opts: { base?: number, k?: number, minR?: number, maxR?: number } = {},
): number {
  const base = opts.base ?? 10
  const k = opts.k ?? 3
  const minR = opts.minR ?? 8
  const maxR = opts.maxR ?? 28
  const raw = base + k * Math.sqrt(Math.max(0, degree))
  return Math.min(maxR, Math.max(minR, raw))
}
