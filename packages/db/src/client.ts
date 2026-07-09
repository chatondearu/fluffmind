import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema/index'

export type DbClient = ReturnType<typeof drizzle<typeof schema>>

let dbInstance: DbClient | null = null
let poolInstance: Pool | null = null

export function createDb(connectionString: string): DbClient {
  const pool = new Pool({ connectionString })
  return drizzle(pool, { schema })
}

export function getDb(): DbClient {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required to initialize @fluffmind/db. Set DATABASE_URL before using getDb() or db.',
    )
  }

  if (!dbInstance) {
    poolInstance = new Pool({ connectionString: databaseUrl })
    dbInstance = drizzle(poolInstance, { schema })
  }

  return dbInstance
}

export const db = new Proxy({} as DbClient, {
  get(_target, property, receiver) {
    return Reflect.get(getDb() as object, property, receiver)
  },
}) as DbClient
