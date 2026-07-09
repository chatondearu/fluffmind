/**
 * Representative vault samples for spike #55.
 * Derived from foam/ note shapes (headings, lists, code, inline marks).
 * Wikilink-heavy notes are intentionally excluded — see SPIKE-55-findings.md.
 */

export const FIXTURE_HEADING_PARAGRAPH = `# Vision & positioning

Fluffmind is a **self-hostable, git-backed** personal knowledge management app.`

export const FIXTURE_BULLET_LIST = `## Audience

- **Primary users**: knowledge workers
- **Operators**: self-hosters using Docker`

export const FIXTURE_ORDERED_LIST = `## Steps

1. Read \`foam/index.md\`
2. Pick an issue from the board
3. Implement with tests`

export const FIXTURE_CODE_FENCE = `## Example

\`\`\`ts
export function hello(name: string): string {
  return \`Hello, \${name}\`
}
\`\`\`

Paragraph after code.`

export const FIXTURE_INLINE_MARKS = `Inline **bold**, *italic*, \`code\`, and [a link](https://example.com).`

export const FIXTURE_WIKILINK = `See [[foam/index|Feature catalog]] and [[ADR-001]].`

export const FIXTURE_TABLE = `| Col A | Col B |
| --- | --- |
| **one** | two |
| three | four |`
