import { randomBytes } from 'node:crypto'
import { rename, rm, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Write via temp file in the same directory + rename, so the Rust daemon (which also
 * reads/writes this vault dir, ADR-020 §3) never observes a half-written note.
 * Pass `mtime` to stamp the file before it becomes visible.
 */
export async function writeFileAtomic(filePath: string, data: string, mtime?: Date): Promise<void> {
  const tmpPath = join(dirname(filePath), `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(tmpPath, data, 'utf-8')
    if (mtime)
      await utimes(tmpPath, new Date(), mtime)
    await rename(tmpPath, filePath)
  }
  catch (error) {
    await rm(tmpPath, { force: true })
    throw error
  }
}
