import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL is not set')
  process.exit(1)
}

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), 'drizzle')
const pool = new Pool({ connectionString: databaseUrl })
const db = drizzle(pool)

try {
  await migrate(db, { migrationsFolder })
  console.log('[migrate] done')
} finally {
  await pool.end()
}
