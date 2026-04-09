import { Pool, type QueryResultRow } from 'pg'

import { env } from './env.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
})

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return pool.query<T>(text, values)
}

export async function closePool() {
  await pool.end()
}
