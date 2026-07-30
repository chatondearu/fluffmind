// apps/web/server/vault/content-roots.ts
export class ContentRootViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentRootViolationError'
  }
}

export class InvalidContentRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidContentRootError'
  }
}

function normalizeOneRoot(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!trimmed) {
    throw new InvalidContentRootError('Content root must not be empty')
  }
  if (trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new InvalidContentRootError('Content root must use forward slashes only')
  }
  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new InvalidContentRootError('Content root contains invalid path segments')
    }
  }
  return segments.join('/')
}

export function normalizeContentRoots(input: unknown): string[] {
  if (input == null) return []
  if (!Array.isArray(input)) {
    throw new InvalidContentRootError('contentRoots must be an array of strings')
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string') {
      throw new InvalidContentRootError('contentRoots must be an array of strings')
    }
    const root = normalizeOneRoot(item)
    if (seen.has(root)) continue
    seen.add(root)
    out.push(root)
  }
  return out
}

export function isPathWithinContentRoots(
  relativePath: string,
  contentRoots: string[],
): boolean {
  if (contentRoots.length === 0) return true
  const path = relativePath.replace(/^\/+/, '').replace(/\/+$/, '')
  return contentRoots.some(root => path === root || path.startsWith(`${root}/`))
}

export function assertWithinContentRoots(
  relativePath: string,
  contentRoots: string[],
): void {
  if (!isPathWithinContentRoots(relativePath, contentRoots)) {
    throw new ContentRootViolationError(
      `Path "${relativePath}" is outside configured content roots`,
    )
  }
}
